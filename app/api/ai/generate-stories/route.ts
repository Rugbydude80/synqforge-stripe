import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { redis } from '@/lib/redis';
import { inngest } from '@/lib/inngest';
import { callAI, type ChatMessage } from '@/lib/aiModelRouter';
import crypto from 'crypto';

/**
 * Compute a SHA256 hash of a string.  This is used to build cache keys
 * for AI generation requests.  Collisions are astronomically
 * improbable for our use case.
 */
function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export const runtime = 'nodejs';

/**
 * Handle POST requests to generate stories from AI.  This route
 * streams responses using the Server‑Sent Events (SSE) protocol.  The
 * client should POST a JSON body with the following fields:
 *   - projectId: string
 *   - organisationId: string
 *   - requirements: string
 *   - model: string (optional; default provided server side)
 *   - force: boolean (optional; bypass cache)
 *
 * The route checks that the organisation has sufficient AI credits
 * remaining, streams new story content from OpenRouter, caches the
 * results in Redis keyed by a hash of the requirements, writes each
 * story to the database (status: draft, ai_generated: true), and
 * triggers an Inngest event to deduct credits.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { projectId, organisationId, requirements, model, force, dueStart, dueEnd, priority } = (await req.json()) as {
    projectId: string;
    organisationId: string;
    requirements: string;
    model?: string;
    force?: boolean;
    dueStart?: string;
    dueEnd?: string;
    priority?: 'low' | 'medium' | 'high';
  };

  // Validate input
  if (!projectId || !organisationId || !requirements) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Check available AI credits for the organisation
  const { data: orgData, error: orgError } = await supabase
    .from('organisations')
    .select('ai_credits')
    .eq('id', organisationId)
    .maybeSingle();
  if (orgError) {
    return NextResponse.json({ error: 'Failed to fetch organisation' }, { status: 500 });
  }
  const aiCredits: number | null | undefined = orgData?.ai_credits;
  if (!aiCredits || aiCredits <= 0) {
    return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 402 });
  }

  // Prepare the SSE response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Kick off the AI generation and caching in the background
  (async () => {
    try {
      const cacheKey = `stories:${hash(requirements + (dueStart||'') + (dueEnd||'') + (priority||''))}`;
      const cached = await redis.get(cacheKey);
      if (cached && !force) {
        // If cached stories exist, send them directly
        const stories = typeof cached === 'string' ? JSON.parse(cached) : cached;
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'cached', stories })}\n\n`
          )
        );
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'complete', count: stories.length })}\n\n`
          )
        );
        await writer.close();
        return;
      }

      // Build prompt and stream from model router (Gemini streaming by default)
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a story generator for agile planning. Generate user stories based on the given requirements. Where provided, incorporate due date constraints and priority levels. Output as sections separated by blank lines, each with Title: and Description: lines.' },
        { role: 'user', content: [
          requirements,
          dueStart && dueEnd ? `\nConstraints: Due between ${dueStart} and ${dueEnd}.` : '',
          priority ? `\nPriority: ${priority}.` : ''
        ].filter(Boolean).join('') }
      ];
      const ai = await callAI('stories', messages, undefined, { force });
      const reader = ai.stream?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const newStories: any[] = [];

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || '';
            buffer += content;
            const parts = buffer.split(/\n\n/);
            buffer = parts.pop() || '';
            for (const part of parts) {
              const titleMatch = part.match(/^Title:\s*(.*)/m);
              const descriptionMatch = part.match(/^Description:\s*([\s\S]*)/m);
              if (!titleMatch) continue;
              const story = {
                title: titleMatch[1].trim(),
                description: descriptionMatch ? descriptionMatch[1].trim() : '',
                status: 'backlog',
                ai_generated: true,
                priority: priority || null,
                due_date: dueEnd || null,
                points: 0
              };
              newStories.push(story);
              await writer.write(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'story', story })}\n\n`
                )
              );
              const numericPriority: number | null =
                priority === 'high' ? 3 : priority === 'medium' ? 2 : priority === 'low' ? 1 : null;
              await supabase.from('stories').insert({
                project_id: projectId,
                title: story.title,
                description: story.description,
                status: 'backlog',
                ai_generated: true,
                priority: numericPriority,
                due_date: dueEnd || null,
                points: 0
              });
            }
          } catch {}
        }
      }
      // Cache the results for one hour
      await redis.set(cacheKey, JSON.stringify(newStories), { ex: 3600 });
      // Deduct credits via Inngest (one credit per story point; adjust as needed)
      await inngest.send({
        name: 'ai.credits.deduct',
        data: { organisationId, tokensUsed: newStories.length }
      });
      // Notify user that generation is complete (best-effort)
      try {
        const { data: me } = await supabase.auth.getUser();
        if (me?.user) {
          await supabase.from('notifications').insert({ user_id: me.user.id, type: 'ai.story.complete', data: { projectId, count: newStories.length, message: 'AI story generation finished.' } });
          try {
            const { publishToUser } = await import('@/lib/ably-server');
            await publishToUser(me.user.id, 'notification', { type: 'ai.story.complete', count: newStories.length });
          } catch {}
        }
      } catch {}
      // Emit completion
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'complete', count: newStories.length })}\n\n`
        )
      );
    } catch (error: any) {
      console.error('AI generation error:', error);
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`
        )
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
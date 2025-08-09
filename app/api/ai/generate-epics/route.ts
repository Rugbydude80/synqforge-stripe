import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { redis } from '@/lib/redis';
import { inngest } from '@/lib/inngest';
import { callAI, type ChatMessage } from '@/lib/aiModelRouter';
import crypto from 'crypto';

/**
 * Compute a SHA256 hash of a string.  We use this to build cache keys
 * for AI generation requests so that the same requirements string
 * doesn't trigger multiple calls to the OpenRouter API.  Collisions
 * are practically impossible for this use case.
 */
function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export const runtime = 'nodejs';

/**
 * POST /api/ai/generate-epics
 *
 * This endpoint generates epics and their tasks (stories) from a
 * requirements document.  It uses the OpenRouter API (GPT‑4 Turbo by
 * default) to produce a JSON structure describing epics, each with a
 * list of tasks.  The results are streamed back to the client using
 * Server‑Sent Events (SSE).  Each epic is emitted with
 * `{ type: 'epic', epic: { ... } }` and each task with
 * `{ type: 'story', story: { ... } }`.  When generation is complete
 * a `{ type: 'complete', count: <number of epics> }` event is sent.
 *
 * Epics are inserted into the `epics` table and tasks into the
 * `stories` table with their `epic_id` set accordingly.  Results are
 * cached in Redis for one hour keyed on the requirements hash.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    projectId,
    organisationId,
    requirements,
    model,
    force,
    dueStart,
    dueEnd,
    priority
  } = (await req.json()) as {
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
  // Check AI credits.  The organisation must have at least one credit.
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
  // Prepare SSE stream
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();
  // Run generation in the background
  (async () => {
    try {
      const cacheKey = `epics:${hash(requirements)}`;
      const cached = await redis.get(cacheKey);
      if (cached && !force) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        // Emit cached epics and stories
        for (const epicBundle of parsed.epics as any[]) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'epic', epic: epicBundle.epic })}\n\n`
            )
          );
          for (const story of epicBundle.tasks) {
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'story', story })}\n\n`
              )
            );
          }
        }
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'complete', count: parsed.epics.length })}\n\n`
          )
        );
        await writer.close();
        return;
      }
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are an assistant that outputs agile epics and tasks in JSON. Given a product requirements document, generate a JSON object with an `epics` array. Each element should have `name`, `description`, and a `tasks` array of objects with `title` and `description`. If constraints (due date range, priority) are provided, reflect them in the resulting tasks. Return only valid JSON matching the schema.'
        },
        { role: 'user', content: [
          requirements,
          dueStart && dueEnd ? `\nConstraints: Due between ${dueStart} and ${dueEnd}.` : '',
          priority ? `\nPriority: ${priority}.` : ''
        ].filter(Boolean).join('') }
      ];
      const schema = {
        name: 'epics_schema',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            epics: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        title: { type: 'string' },
                        description: { type: 'string' }
                      },
                      required: ['title']
                    }
                  }
                },
                required: ['name']
              }
            }
          },
          required: ['epics']
        }
      } as const;
      const ai = await callAI('epics', messages, schema, { modelOverride: 'gpt-4o-mini', force });
      const content: string | undefined = ai.text;
      if (!content) {
        throw new Error('Empty AI response');
      }
      const parsedJson: { epics: { name: string; description?: string; tasks?: { title: string; description?: string }[] }[] } = ai.json ?? JSON.parse(content);
      const storedEpics: any[] = [];
      for (const epic of parsedJson.epics || []) {
        // Insert epic into database
        const { data: epicInsert, error: epicError } = await supabase
          .from('epics')
          .insert({ project_id: projectId, name: epic.name, description: epic.description, status: 'open' })
          .select()
          .maybeSingle();
        if (epicError || !epicInsert) {
          // Skip this epic on error
          // eslint-disable-next-line no-console
          console.error('Failed to insert epic', epicError);
          continue;
        }
        const epicId = epicInsert.id as string;
        // Emit epic via SSE
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'epic', epic: epicInsert })}\n\n`
          )
        );
        const tasksList: any[] = [];
        for (const task of epic.tasks || []) {
          const { data: storyInsert, error: storyError } = await supabase
            .from('stories')
            .insert({
              project_id: projectId,
              title: task.title,
              description: task.description,
              status: 'backlog',
              epic_id: epicId,
              ai_generated: true,
              priority: priority || null,
              due_date: dueEnd || null
            })
            .select()
            .maybeSingle();
          if (storyError || !storyInsert) {
            // eslint-disable-next-line no-console
            console.error('Failed to insert task', storyError);
            continue;
          }
          tasksList.push(storyInsert);
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'story', story: storyInsert })}\n\n`
            )
          );
        }
        storedEpics.push({ epic: epicInsert, tasks: tasksList });
      }
      // Cache the stored epics for one hour
      await redis.set(cacheKey, JSON.stringify({ epics: storedEpics }), { ex: 3600 });
      // Deduct credits based on number of tasks generated.  One credit per task.
      let tokensUsed = 0;
      for (const bundle of storedEpics) {
        tokensUsed += (bundle.tasks as any[]).length;
      }
      await inngest.send({ name: 'ai.credits.deduct', data: { organisationId, tokensUsed } });
      // Notify user that generation is complete
      try {
        const { data: me } = await supabase.auth.getUser();
        if (me?.user) {
          await supabase.from('notifications').insert({ user_id: me.user.id, type: 'ai.epics.complete', data: { projectId, epics: storedEpics.length, message: 'AI epic generation finished.' } });
          try {
            const { publishToUser } = await import('@/lib/ably-server');
            await publishToUser(me.user.id, 'notification', { type: 'ai.epics.complete', epics: storedEpics.length });
          } catch {}
        }
      } catch {}
      // Emit completion event
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'complete', count: storedEpics.length })}\n\n`
        )
      );
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('AI epic generation error:', error);
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
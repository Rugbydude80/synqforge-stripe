import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getRedisClient } from '@/lib/redis';
import { emitAICreditsDeduct } from '@/utils/ai';

export const runtime = 'nodejs';

type GenerateStoriesBody = {
  projectId: string;
  organisationId: string;
  requirements: string;
  model?: string;
  force?: boolean;
};

function textSSE(data: string) {
  return `data: ${data.replace(/\n/g, '\\n')}\n\n`;
}

function jsonSSE(payload: unknown) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function hashKey(input: string) {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildPrompt(requirements: string) {
  return [
    {
      role: 'system',
      content:
        'You are a product and agile expert. Generate concise, well-structured user stories suitable for a product backlog. Respond ONLY with a valid JSON array of objects: [{"title": string, "description": string}]. Do not include markdown, code fences, or commentary.'
    },
    {
      role: 'user',
      content: `Requirements:\n${requirements}\n\nReturn a JSON array of 6-12 stories with fields: title, description.`
    }
  ];
}

async function streamOpenRouter({
  model,
  messages,
  onToken
}: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  onToken: (token: string) => void | Promise<void>;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');
  const referer = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': referer,
      'X-Title': 'SynqForge AI Story Generator'
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages
    })
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`OpenRouter error: ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.replace(/^data:\s*/, '');
      if (data === '[DONE]') {
        return;
      }
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content as string | undefined;
        if (delta) {
          await onToken(delta);
        }
      } catch {
        // Ignore malformed chunks
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as GenerateStoriesBody;
    const { projectId, organisationId, requirements, model = 'openai/gpt-4o-mini', force } = body || {};

    if (!projectId || !organisationId || !requirements) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Rate limiting is also enforced in middleware, but add a safety check per user
    const redis = getRedisClient();
    const userRatelimitKey = `rl:user:${userId}`;
    try {
      const count = Number(await redis.get(userRatelimitKey)) || 0;
      if (count > 60) return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
      await redis.set(userRatelimitKey, count + 1, { ex: 60 });
    } catch {}

    // Validate credits
    const { data: org, error: orgErr } = await supabase
      .from('organisations' as any)
      .select('id, ai_credits')
      .eq('id', organisationId)
      .maybeSingle();
    if (orgErr) {
      return NextResponse.json({ error: 'Failed to load organisation' }, { status: 500 });
    }
    const aiCredits: number = Number((org as any)?.ai_credits ?? 0);
    if (!Number.isFinite(aiCredits) || aiCredits <= 0) {
      return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 402 });
    }

    // Cache check
    const cacheKeyBase = `stories:${organisationId}:${projectId}:${model}:${requirements}`;
    const cacheKey = `ai:stories:${await hashKey(cacheKeyBase)}`;
    if (!force) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(jsonSSE({ cached: true })));
            // stream cached payload line-by-line tokens for UI continuity
            const text = String(cached);
            controller.enqueue(encoder.encode(textSSE(text)));
            controller.enqueue(encoder.encode('event: done\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Cache': 'HIT'
          }
        });
      }
    }

    // Prepare SSE stream
    const encoder = new TextEncoder();
    let fullText = '';

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (data: string) => controller.enqueue(encoder.encode(data));
        // Announce start
        write(jsonSSE({ cached: false }));

        // Build messages and stream from OpenRouter
        const messages = buildPrompt(requirements);

        try {
          await streamOpenRouter({
            model,
            messages,
            onToken: async (token) => {
              fullText += token;
              write(textSSE(token));
            }
          });
        } catch (err: any) {
          write(jsonSSE({ error: 'AI generation failed', message: String(err?.message || err) }));
          controller.close();
          return;
        }

        // Attempt to parse JSON stories
        let stories: Array<{ title: string; description: string }> = [];
        try {
          const parsed = JSON.parse(fullText);
          if (Array.isArray(parsed)) {
            stories = parsed
              .filter((s) => s && typeof s.title === 'string' && typeof s.description === 'string')
              .slice(0, 50);
          }
        } catch {
          // Best-effort naive parsing: split by double newline as fallback
          const parts = fullText
            .split(/\n\n+/)
            .map((p) => p.trim())
            .filter(Boolean);
          stories = parts.map((p, i) => ({ title: `AI Story ${i + 1}`, description: p })).slice(0, 12);
        }

        // Persist stories
        if (stories.length > 0) {
          await supabase
            .from('stories' as any)
            .insert(
              stories.map((s) => ({
                project_id: projectId,
                title: s.title,
                description: s.description,
                // Note: schema enum doesn't include 'draft'. Using default/backlog.
                status: 'backlog',
                ai_generated: true
              })) as any
            );
        }

        // Cache full response for one hour
        await redis.set(cacheKey, fullText, { ex: 60 * 60 });

        // Rough token estimation and deduct via Inngest
        const approxTokens = Math.max(1, Math.round(fullText.length / 4));
        await emitAICreditsDeduct(organisationId, approxTokens);

        // Signal done
        write('event: done\n');
        write('data: [DONE]\n\n');
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}



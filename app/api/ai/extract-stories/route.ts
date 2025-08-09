import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { runJson } from '@/lib/ai/run';
import { pickModel } from '@/lib/ai/router';
import type { Database } from '@/types/extended-db';

type Input = {
  clientId?: string | null;
  ingestId: string;
  style?: 'concise' | 'detailed';
  enforceSchema?: boolean;
  defaultPoints?: number;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = (await req.json().catch(() => ({}))) as Input;
  const { clientId, ingestId, style = 'concise', enforceSchema = false, defaultPoints = 3 } = body;

  if (!ingestId) return NextResponse.json({ error: 'ingestId is required' }, { status: 400 });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data: ingest } = await supabase.from('ingests').select('id, raw_text').eq('id', ingestId).single();
  const raw = ingest?.raw_text ?? '';
  if (!raw.trim()) return NextResponse.json({ error: 'empty_ingest' }, { status: 400 });

  const schema = {
    name: 'stories_array',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'as_a', 'i_want', 'so_that', 'acceptance_criteria', 'points', 'priority'],
        properties: {
          title: { type: 'string', minLength: 4 },
          as_a: { type: 'string' },
          i_want: { type: 'string' },
          so_that: { type: 'string' },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          points: { type: 'integer', minimum: 1, maximum: 13 },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] }
        }
      }
    }
  } as const;

  const prompt = `Extract user stories from the following notes. Style: ${style}.
Return a JSON array of story objects with keys: title, as_a, i_want, so_that, acceptance_criteria (array of strings), points (1-13), priority (low|medium|high).
Only return valid JSON, no prose.

NOTES:\n\n${raw.slice(0, 50000)}`;

  const model = pickModel({ strictSchema: enforceSchema });
  const stories = await runJson<any[]>({ model, prompt, schema });

  // Deduplicate by (ingestId, title)
  const titles = stories.map((s) => String(s.title || '').trim()).filter(Boolean);
  const unique = new Set<string>();
  const deduped = stories.filter((s) => {
    const key = `${ingestId}:${String(s.title || '').trim().toLowerCase()}`;
    if (unique.has(key)) return false;
    unique.add(key);
    return true;
  });

  // Insert as candidates
  const rows: Database['public']['Tables']['story_candidates']['Insert'][] = deduped.map((s) => ({
    client_id: clientId ?? null,
    ingest_id: ingestId,
    title: String(s.title ?? '').slice(0, 300),
    description: [s.as_a, s.i_want, s.so_that].filter(Boolean).join(' '),
    acceptance_criteria: (Array.isArray(s.acceptance_criteria) ? s.acceptance_criteria : []) as unknown as any,
    points: Number.isFinite(s.points) ? Math.max(1, Math.min(13, Number(s.points))) : defaultPoints,
    priority: (['low', 'medium', 'high'].includes(s.priority) ? s.priority : 'medium') as 'low' | 'medium' | 'high',
    status: 'proposed'
  }));

  const { data: inserted, error } = await supabase
    .from('story_candidates')
    .insert(rows)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ candidateIds: inserted?.map((r) => r.id) ?? [] });
}



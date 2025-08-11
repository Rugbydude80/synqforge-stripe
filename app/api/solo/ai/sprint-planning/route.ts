import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { runJson } from '@/lib/ai/run';
import { hasAI } from '@/lib/env';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { clientId, capacity_points, lookback_sprints = 3 } = body as { clientId: string; capacity_points: number; lookback_sprints?: number };
  if (!clientId || !capacity_points) return NextResponse.json({ error: 'clientId and capacity_points required' }, { status: 400 });

  // Compute historical velocity
  const { data: sprints } = await supabase.from('sprints').select('velocity, story_points_completed, start_date, end_date').order('start_date', { ascending: false }).limit(lookback_sprints);
  const velocity = (sprints || []).reduce((sum, s: any) => sum + (s.velocity || 0), 0) / Math.max(1, (sprints || []).length);

  // Select backlog stories greedily by priority desc, due_date asc
  const { data: backlog } = await supabase.from('stories').select('id, points, priority, due_date, status').eq('status', 'backlog');
  const sorted = (backlog || []).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0) || (new Date(a.due_date || '2100-01-01').getTime() - new Date(b.due_date || '2100-01-01').getTime()));
  const target = Math.round(capacity_points * 1.1);
  const selected: string[] = [];
  let total = 0;
  for (const s of sorted) {
    const p = s.points || 0;
    if (total + p > target) continue;
    selected.push(s.id);
    total += p;
  }

  // Ask AI for risks and suggested order
  const prompt = `Given these backlog items (with points): ${selected.join(', ')}. Provide JSON with keys: suggested_order (array of story IDs in recommended order) and risks (array of strings).`;
  const schema = { name: 'planning', schema: { type: 'object', required: ['suggested_order', 'risks'], properties: { suggested_order: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } } } } };
  let ai = { suggested_order: selected, risks: [] as string[] };
  if (hasAI()) {
    try {
      ai = await runJson<typeof ai>({ prompt, schema });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ selected_story_ids: selected, total_points: total, suggested_order: ai.suggested_order, risks: ai.risks, velocity_estimate: velocity });
}



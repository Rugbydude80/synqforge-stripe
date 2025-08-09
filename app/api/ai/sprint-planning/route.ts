import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { callAI, type ChatMessage } from '@/lib/aiModelRouter';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * POST /api/ai/sprint-planning
 *
 * This endpoint provides a very simple sprint planning recommendation. It
 * selects a number of backlog stories up to the provided team capacity.
 * In a real application you would call a model via OpenRouter to perform
 * sophisticated selection based on requirements, capacity and velocity.
 */
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const { projectId, teamCapacity = 5, historicalVelocity = 5, sprintDuration = 14 } = body;
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }
  // Ensure user has access to the project. For brevity we skip RLS checks
  // here; Supabase RLS will enforce permissions on the query below.
  // Fetch all stories that are not yet completed
  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('id, title, created_at, points, due_date')
    .eq('project_id', projectId)
    .in('status', ['backlog', 'in_progress', 'review']);
  if (storiesError) {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 });
  }
  // Sort by creation date and pick stories whose total points <= teamCapacity
  const sorted = (stories ?? []).sort((a, b) => {
    const da = new Date(a.created_at ?? 0).getTime();
    const db = new Date(b.created_at ?? 0).getTime();
    return da - db;
  });
  let runningTotal = 0;
  const selected: { id: string; title: string; points: number }[] = [];
  for (const s of sorted) {
    const pts = typeof s.points === 'number' && !Number.isNaN(s.points) ? s.points : 0;
    if (runningTotal + pts <= teamCapacity) {
      runningTotal += pts;
      selected.push({ id: s.id, title: s.title, points: pts });
    }
  }
  // Include due dates and velocity into a planning note for the client.
  const earliestDue = (stories ?? [])
    .map((s: any) => s.due_date)
    .filter(Boolean)
    .sort()[0];
  let summary = `AI suggests ${selected.length} stories totalling ${runningTotal} points (capacity ${teamCapacity}). Historical velocity: ${historicalVelocity} pts/day over ${sprintDuration} days. Earliest due: ${earliestDue || 'n/a'}.`;
  try {
    const prompt = [
      `Team capacity: ${teamCapacity} points`,
      `Historical velocity: ${historicalVelocity} points/day`,
      `Sprint duration: ${sprintDuration} days`,
      `Earliest due date among candidates: ${earliestDue || 'n/a'}`,
      '',
      'Candidate stories (id, title, points):',
      ...selected.map((s) => `- ${s.id}: ${s.title} (${s.points} pts)`),
      '',
      'Write a concise planning note summarizing risk due to due dates and whether selection fits capacity. Return a single sentence.'
    ].join('\n');
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an assistant that writes agile planning notes.' },
      { role: 'user', content: prompt }
    ];
    const ai = await callAI('sprint-planning', messages, undefined, { temperature: 0.3, maxTokens: 200 });
    if (ai.text) summary = ai.text.trim();
  } catch {
    // ignore
  }
  return NextResponse.json({ summary, suggestedStories: selected });
}
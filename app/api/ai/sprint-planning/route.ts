import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
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
    // Best-effort: enrich summary via OpenRouter if API key is present
    if (process.env.OPENROUTER_API_KEY) {
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
      const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '',
          'X-Title': 'SynqForge Sprint Planning',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: 'You are an assistant that writes agile planning notes.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 200,
          stream: false
        })
      });
      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        const content: string | undefined = aiJson?.choices?.[0]?.message?.content;
        if (content) summary = content.trim();
      }
    }
  } catch {
    // ignore AI errors; fallback to computed summary
  }
  return NextResponse.json({ summary, suggestedStories: selected });
}
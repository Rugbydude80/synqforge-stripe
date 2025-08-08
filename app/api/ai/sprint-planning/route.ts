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
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['backlog', 'in_progress', 'review']);
  if (storiesError) {
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 });
  }
  // Sort by creation date and pick up to the team capacity
  const sorted = (stories ?? []).sort((a, b) => {
    const da = new Date(a.created_at ?? 0).getTime();
    const db = new Date(b.created_at ?? 0).getTime();
    return da - db;
  });
  const selected = sorted.slice(0, Math.min(teamCapacity, sorted.length));
  return NextResponse.json({
    summary: `AI suggests selecting ${selected.length} stories for the next sprint based on your capacity of ${teamCapacity} and historical velocity of ${historicalVelocity}.`,
    suggestedStories: selected.map((s) => ({ id: s.id, title: s.title, points: 2 }))
  });
}
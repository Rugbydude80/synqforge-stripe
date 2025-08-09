import { NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type SprintPayload = {
  id?: string;
  projectId: string;
  name: string;
  goal?: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status?: string; // planning | active | completed | archived
  capacityPoints?: number;
};

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as SprintPayload;
  const { projectId, name, goal, startDate, endDate, status = 'planning' } = body;
  if (!projectId || !name || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('sprints')
    .insert({
      project_id: projectId,
      name,
      goal: goal ?? null,
      start_date: startDate,
      end_date: endDate,
      status,
      capacity_points: body.capacityPoints ?? 0
    })
    .select('*')
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create sprint' }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as SprintPayload;
  const { id, projectId, name, goal, startDate, endDate, status, capacityPoints } = body;
  if (!id) return NextResponse.json({ error: 'Missing sprint id' }, { status: 400 });
  // Load existing sprint to detect status transition
  const { data: existing } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  const { data, error } = await supabase
    .from('sprints')
    .update({
      project_id: projectId ?? existing?.project_id,
      name: name ?? existing?.name,
      goal: goal ?? existing?.goal,
      start_date: startDate ?? existing?.start_date,
      end_date: endDate ?? existing?.end_date,
      status: status ?? existing?.status,
      capacity_points: typeof capacityPoints === 'number' ? capacityPoints : existing?.capacity_points
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update sprint' }, { status: 500 });
  }
  // If sprint transitioned to completed, auto-generate retrospective
  try {
    const transitionedToActive = existing && status && existing.status !== 'active' && status === 'active';
    const transitionedToCompleted = existing && status && existing.status !== 'completed' && status === 'completed';
    if (transitionedToActive) {
      // Move all stories assigned to this sprint to in_progress
      await supabase
        .from('stories')
        .update({ status: 'in_progress' })
        .eq('sprint_id', id);
    }
    if (transitionedToCompleted) {
      // Mark sprint stories done with completed_at timestamp
      const nowIso = new Date().toISOString();
      const { data: updatedStories } = await supabase
        .from('stories')
        .update({ status: 'done', completed_at: nowIso })
        .eq('sprint_id', id)
        .select('points');
      const totalPoints = (updatedStories ?? []).reduce((sum, s: any) => sum + (s.points ?? 0), 0);
      // Compute velocity as points per day for the sprint duration
      const start = new Date((data as any).start_date);
      const end = new Date((data as any).end_date);
      const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const velocity = totalPoints / durationDays;
      await supabase
        .from('sprints')
        .update({ story_points_completed: totalPoints, velocity })
        .eq('id', id);
      // Publish notification to project members? Insert per-user notifications based on project membership
      const { data: members } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', data.project_id);
      const message = `Sprint "${(data as any).name}" completed. ${totalPoints} points done.`;
      const rows = (members || []).map((m: any) => ({ user_id: m.user_id, type: 'sprint.completed', data: { sprintId: id, message } }));
      if (rows.length > 0) {
        await supabase.from('notifications').insert(rows);
      }
      // Determine organisation id for AI credits
      const { data: project } = await supabase
        .from('projects')
        .select('organisation_id')
        .eq('id', data.project_id)
        .maybeSingle();
      const organisationId = project?.organisation_id;
      if (organisationId) {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/ai/generate-retrospective`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sprintId: id, organisationId })
        });
      }
    }
  } catch {
    // best-effort; do not fail the response if retrospective generation errors
  }
  return NextResponse.json(data);
}



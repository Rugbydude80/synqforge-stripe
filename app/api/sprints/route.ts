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
      status
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
  const { id, projectId, name, goal, startDate, endDate, status } = body;
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
      status: status ?? existing?.status
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update sprint' }, { status: 500 });
  }
  // If sprint transitioned to completed, auto-generate retrospective
  try {
    const transitionedToCompleted = existing && status && existing.status !== 'completed' && status === 'completed';
    if (transitionedToCompleted) {
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



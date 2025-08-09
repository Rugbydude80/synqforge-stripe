import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { sprintId, storyIds } = body as { sprintId: string; storyIds: string[] };
  if (!sprintId) return NextResponse.json({ error: 'sprintId required' }, { status: 400 });

  // Mark stories done and set completed_at
  const now = new Date().toISOString();
  if (Array.isArray(storyIds) && storyIds.length > 0) {
    await supabase.from('stories').update({ status: 'done', completed_at: now }).in('id', storyIds);
  }
  // Compute story_points_completed
  const { data: stories } = await supabase.from('stories').select('points, sprint_id').eq('sprint_id', sprintId).eq('status', 'done');
  const points = (stories || []).reduce((sum, s: any) => sum + (s.points || 0), 0);
  // Approximate duration in days
  const { data: sprint } = await supabase.from('sprints').select('start_date, end_date').eq('id', sprintId).single();
  const start = sprint?.start_date ? new Date(sprint.start_date) : new Date();
  const end = sprint?.end_date ? new Date(sprint.end_date) : new Date();
  const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const velocity = points / durationDays;

  await supabase.from('sprints').update({ status: 'completed', story_points_completed: points, velocity }).eq('id', sprintId);
  return NextResponse.json({ points, velocity });
}



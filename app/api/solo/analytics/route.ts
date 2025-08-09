import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  // Velocity per sprint
  const { data: sprints } = await supabase.from('sprints').select('id, story_points_completed, start_date, end_date').order('start_date');
  const velocityPerSprint = (sprints || []).map((s: any) => {
    const start = new Date(s.start_date);
    const end = new Date(s.end_date);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const points = s.story_points_completed || 0;
    return { sprintId: s.id, points, duration: days };
  });

  // Points by status in backlog
  const { data: stories } = await supabase.from('stories').select('status, points');
  const pointsByStatus: Record<string, number> = { backlog: 0, in_progress: 0, review: 0, done: 0 };
  for (const st of stories || []) {
    const key = st.status as keyof typeof pointsByStatus;
    pointsByStatus[key] = (pointsByStatus[key] || 0) + (st.points || 0);
  }

  // Basic burndown for current active sprint
  const { data: active } = await supabase.from('sprints').select('id, start_date, end_date').eq('status', 'active').maybeSingle();
  let currentBurndown: Array<{ date: string; remaining: number }> = [];
  if (active) {
    const { data: inSprint } = await supabase.from('stories').select('points, status').eq('sprint_id', (active as any).id);
    const total = (inSprint || []).reduce((sum, s: any) => sum + (s.points || 0), 0);
    const days = Math.max(1, Math.round((new Date((active as any).end_date).getTime() - new Date((active as any).start_date).getTime()) / (1000 * 60 * 60 * 24)));
    for (let d = 0; d <= days; d++) {
      const date = new Date(new Date((active as any).start_date).getTime() + d * 86400000);
      const donePoints = (inSprint || []).filter((s: any) => s.status === 'done').reduce((sum, s: any) => sum + (s.points || 0), 0);
      currentBurndown.push({ date: date.toISOString().slice(0, 10), remaining: Math.max(0, total - donePoints) });
    }
  }

  return NextResponse.json({ velocityPerSprint, currentBurndown, pointsByStatus });
}



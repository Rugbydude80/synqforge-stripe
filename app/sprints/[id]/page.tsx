import { redirect } from 'next/navigation';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import SprintDetailClient from './SprintDetailClient';

export default async function SprintDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const sprintId = params.id;
  const { data: sprint } = await supabase
    .from('sprints')
    .select('id, project_id, name, goal, start_date, end_date, status, capacity_points, story_points_completed, velocity')
    .eq('id', sprintId)
    .maybeSingle();
  if (!sprint) {
    return <div className="p-6">Sprint not found.</div>;
  }

  // Stories in sprint
  const { data: stories } = await supabase
    .from('stories')
    .select('id, title, status, points, completed_at, updated_at')
    .eq('sprint_id', sprint.id)
    .order('created_at', { ascending: true });

  // Retrospectives for sprint
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, summary, notes, tags, created_at')
    .eq('sprint_id', sprint.id)
    .order('created_at', { ascending: false });

  // Compute burndown points (server) to avoid duplicating logic
  const start = new Date(sprint.start_date as any);
  const end = new Date(sprint.end_date as any);
  const totalPoints = (stories || []).reduce((sum: number, s: any) => sum + (s.points ?? 0), 0);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const burndown: Array<{ date: string; remaining: number }> = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const completedByDay = (stories || []).reduce((sum: number, s: any) => {
      const completedAt = s.completed_at ? new Date(s.completed_at).getTime() : undefined;
      if (s.status === 'done' && completedAt && completedAt <= day.getTime()) {
        return sum + (s.points ?? 0);
      }
      return sum;
    }, 0);
    const remaining = Math.max(totalPoints - completedByDay, 0);
    burndown.push({ date: day.toISOString().substring(0, 10), remaining });
  }

  return <SprintDetailClient sprint={sprint as any} stories={(stories || []) as any} retros={(retros || []) as any} burndown={burndown} />;
}



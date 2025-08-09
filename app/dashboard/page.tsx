import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import React from 'react';

const ResponsiveContainer: any = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer as any), { ssr: false, loading: () => null });
const PieChart: any = dynamic(() => import('recharts').then((m) => m.PieChart as any), { ssr: false, loading: () => null });
const Pie: any = dynamic(() => import('recharts').then((m) => m.Pie as any), { ssr: false, loading: () => null });
const Cell: any = dynamic(() => import('recharts').then((m) => m.Cell as any), { ssr: false, loading: () => null });
const BarChart: any = dynamic(() => import('recharts').then((m) => m.BarChart as any), { ssr: false, loading: () => null });
const Bar: any = dynamic(() => import('recharts').then((m) => m.Bar as any), { ssr: false, loading: () => null });
const XAxis: any = dynamic(() => import('recharts').then((m) => m.XAxis as any), { ssr: false, loading: () => null });
const YAxis: any = dynamic(() => import('recharts').then((m) => m.YAxis as any), { ssr: false, loading: () => null });
const Tooltip: any = dynamic(() => import('recharts').then((m) => m.Tooltip as any), { ssr: false, loading: () => null });
const Legend: any = dynamic(() => import('recharts').then((m) => m.Legend as any), { ssr: false, loading: () => null });

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-zinc-500">Please sign in to view your organisation dashboard.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.organisation_id) {
    return <div className="p-6">No organisation.</div>;
  }
  const orgId = profile.organisation_id as string;
  // Load projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organisation_id', orgId);
  const projectIds = (projects || []).map((p) => p.id);

  // Aggregate stories by status per project
  const { data: stories } = await supabase
    .from('stories')
    .select('id, status, project_id, due_date')
    .in('project_id', projectIds);

  // Velocity per sprint average (points/time) across org
  const { data: sprints } = await supabase
    .from('sprints')
    .select('project_id, velocity')
    .in('project_id', projectIds)
    .not('velocity', 'is', null);

  const avgVelocity = (() => {
    const vals = (sprints || []).map((s: any) => Number(s.velocity)).filter((n) => Number.isFinite(n));
    if (vals.length === 0) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  })();

  // AI credits usage: count of ai_operations for org
  const { data: aiOps } = await supabase
    .from('ai_operations')
    .select('id')
    .eq('organisation_id', orgId);
  const aiUsage = (aiOps || []).length;

  const statusCountsByProject: Record<string, any> = {};
  (projects || []).forEach((p) => (statusCountsByProject[p.id] = { name: p.name, backlog: 0, in_progress: 0, review: 0, done: 0 }));
  (stories || []).forEach((s: any) => {
    const row = statusCountsByProject[s.project_id];
    if (!row) return;
    if (row[s.status] !== undefined) row[s.status] += 1;
  });
  const barData = Object.values(statusCountsByProject);

  const upcomingByProject: Record<string, number> = {};
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  (projects || []).forEach((p) => (upcomingByProject[p.name] = 0));
  (stories || []).forEach((s: any) => {
    if (!s.due_date) return;
    const d = new Date(s.due_date);
    if (d >= now && d <= soon) {
      const project = (projects || []).find((p) => p.id === s.project_id);
      if (project) upcomingByProject[project.name] += 1;
    }
  });
  const pieData = Object.entries(upcomingByProject).map(([name, value]) => ({ name, value }));
  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d0ed57'];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 border rounded bg-white dark:bg-zinc-800">
          <h2 className="font-semibold mb-2">Workload by Status</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData as any}>
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="backlog" stackId="a" fill="#94a3b8" name="Backlog" />
                <Bar dataKey="in_progress" stackId="a" fill="#60a5fa" name="In Progress" />
                <Bar dataKey="review" stackId="a" fill="#fbbf24" name="Review" />
                <Bar dataKey="done" stackId="a" fill="#34d399" name="Done" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-800">
          <h2 className="font-semibold mb-2">Upcoming Due (14 days)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData as any} dataKey="value" nameKey="name" outerRadius={100} label>
                  {(pieData as any).map((_entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 border rounded bg-white dark:bg-zinc-800">
          <div className="text-sm text-zinc-500">Projects</div>
          <div className="text-3xl font-bold">{projects?.length ?? 0}</div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-800">
          <div className="text-sm text-zinc-500">AI Credits Usage</div>
          <div className="text-3xl font-bold">{aiUsage}</div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-800">
          <div className="text-sm text-zinc-500">Average Velocity</div>
          <div className="text-3xl font-bold">{avgVelocity}</div>
        </div>
      </div>
    </div>
  );
}



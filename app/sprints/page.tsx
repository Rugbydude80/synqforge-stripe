import { redirect } from 'next/navigation';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

export default async function SprintsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/signin');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.organisation_id) {
    return <div className="p-6">You are not a member of any organisation.</div>;
  }
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!project) {
    return <div className="p-6">No projects found.</div>;
  }
  return <SprintsClient projectId={project.id} />;
}

// Client component
// @ts-ignore
"use client";
import { useEffect, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { toast } from '@/components/ui/Toasts/use-toast';

type Sprint = {
  id: string;
  name: string;
  goal: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status: string;
};

function SprintsClient({ projectId }: { projectId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [form, setForm] = useState<Partial<Sprint> & { id?: string }>({
    name: '',
    goal: '',
    start_date: '',
    end_date: '',
    status: 'planning'
  });
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('start_date', { ascending: false });
    if (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      toast({ title: 'Error', description: 'Failed to load sprints' });
    } else {
      setSprints(data || []);
    }
  };

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`sprints:${projectId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sprints', filter: `project_id=eq.${projectId}` }, () => void refresh())
      .subscribe();
    return () => channel.unsubscribe();
  }, [projectId]);

  const submit = async () => {
    setSaving(true);
    try {
      if (!form.name || !form.start_date || !form.end_date) {
        toast({ title: 'Error', description: 'Name, start and end dates are required' });
        return;
      }
      const res = await fetch('/api/sprints', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          projectId,
          name: form.name,
          goal: form.goal,
          startDate: form.start_date,
          endDate: form.end_date,
          status: form.status
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Error', description: data.error || 'Failed to save sprint' });
      } else {
        toast({ title: 'Saved', description: 'Sprint saved' });
        setForm({ name: '', goal: '', start_date: '', end_date: '', status: 'planning' });
        void refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const edit = (s: Sprint) => setForm({ id: s.id, name: s.name, goal: s.goal ?? '', start_date: s.start_date, end_date: s.end_date, status: s.status });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sprints</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded border p-4 bg-white dark:bg-zinc-900">
          <h2 className="font-semibold mb-3">{form.id ? 'Edit Sprint' : 'Create Sprint'}</h2>
          <div className="space-y-3">
            <input className="w-full rounded border p-2" placeholder="Name" value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="w-full rounded border p-2" placeholder="Goal" value={form.goal || ''} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} />
            <div className="flex gap-2">
              <input className="w-full rounded border p-2" type="date" value={form.start_date || ''} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              <input className="w-full rounded border p-2" type="date" value={form.end_date || ''} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </div>
            <select className="w-full rounded border p-2" value={form.status || 'planning'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="planning">planning</option>
              <option value="active">active</option>
              <option value="completed">completed</option>
              <option value="archived">archived</option>
            </select>
            <button className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
        <div className="rounded border p-4 bg-white dark:bg-zinc-900">
          <h2 className="font-semibold mb-3">Existing Sprints</h2>
          <ul className="space-y-2">
            {sprints.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded border p-2">
                <div>
                  <div className="font-medium">{s.name} <span className="text-xs text-zinc-500">[{s.status}]</span></div>
                  <div className="text-xs text-zinc-500">{s.start_date} → {s.end_date}</div>
                </div>
                <button className="text-sm text-blue-600" onClick={() => edit(s)}>Edit</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}



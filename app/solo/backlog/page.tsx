'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

type Story = {
  id: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  points: number | null;
  priority: number | null;
  due_date: string | null;
  sprint_id: string | null;
  ingest_id?: string | null;
};

const statusOptions = ['backlog', 'in_progress', 'review', 'done'] as const;

export default function SoloBacklogPage() {
  const supabase = createSupabaseBrowserClient();
  const search = useSearchParams();
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [q, setQ] = useState(search.get('q') || '');
  const [status, setStatus] = useState<string>(search.get('status') || '');
  const [priority, setPriority] = useState<string>(search.get('priority') || '');

  function setParam(name: string, value: string) {
    const sp = new URLSearchParams(search.toString());
    if (value) sp.set(name, value); else sp.delete(name);
    router.replace(`/solo/backlog?${sp.toString()}`);
  }

  async function refresh() {
    // For Freelancer mode, use stories with no project assigned
    let query = supabase.from('stories').select('id,title,status,points,priority,due_date,sprint_id,ingest_id').is('project_id', null);
    const { data } = await query;
    setStories((data as any) || []);
  }

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return stories.filter((s) => {
      if (status && s.status !== status) return false;
      if (priority) {
        const p = Number(priority);
        if ((s.priority || 0) !== p) return false;
      }
      if (q) {
        const t = `${s.title}`.toLowerCase();
        if (!t.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [stories, q, status, priority]);

  async function updateStory(id: string, patch: Partial<Story>) {
    await supabase.from('stories').update(patch as any).eq('id', id);
    setStories((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } as any : s)));
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Solo backlog</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
        <input className="bg-zinc-900 border rounded p-2" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setParam('q', e.target.value); }} />
        <select className="bg-zinc-900 border rounded p-2" value={status} onChange={(e) => { setStatus(e.target.value); setParam('status', e.target.value); }}>
          <option value="">Status…</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="bg-zinc-900 border rounded p-2" value={priority} onChange={(e) => { setPriority(e.target.value); setParam('priority', e.target.value); }}>
          <option value="">Priority…</option>
          <option value="3">High</option>
          <option value="2">Medium</option>
          <option value="1">Low</option>
        </select>
        <div />
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((s) => (
          <li key={s.id} className="border border-zinc-800 rounded p-3">
            <div className="flex items-start justify-between gap-3">
              <input className="flex-1 bg-transparent border rounded p-2 font-medium" value={s.title} onChange={(e) => setStories((prev) => prev.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} onBlur={() => updateStory(s.id, { title: s.title })} />
              <div className="text-xs whitespace-nowrap">
                <span className={`px-2 py-1 rounded ${s.priority === 3 ? 'bg-red-600' : s.priority === 2 ? 'bg-yellow-600' : 'bg-zinc-700'}`}>{s.points ?? 0} pts</span>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-xs items-center">
              <select className="bg-transparent border rounded p-1" value={s.status} onChange={(e) => updateStory(s.id, { status: e.target.value as Story['status'] })}>
                {statusOptions.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <select className="bg-transparent border rounded p-1" value={String(s.priority || 0)} onChange={(e) => updateStory(s.id, { priority: Number(e.target.value) as any })}>
                <option value="1">Low</option>
                <option value="2">Medium</option>
                <option value="3">High</option>
              </select>
              <input type="date" className="bg-transparent border rounded p-1" value={s.due_date || ''} onChange={(e) => updateStory(s.id, { due_date: e.target.value })} />
              {s.ingest_id && (
                <a href={`/solo/ingest?ingestId=${s.ingest_id}`} className="ml-auto px-2 py-1 rounded bg-blue-600 text-white">From ingest</a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}



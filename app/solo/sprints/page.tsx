'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

export default function SprintsPage() {
  const supabase = createSupabaseBrowserClient();
  const [sprints, setSprints] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 20 });

  async function refresh() {
    const { data } = await supabase.from('sprints').select('*').order('start_date', { ascending: false });
    setSprints(data || []);
  }
  useEffect(() => { refresh(); }, []);

  async function createSprint() {
    await fetch('/api/solo/sprints/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ name: '', goal: '', start_date: '', end_date: '', capacity_points: 20 });
    await refresh();
  }

  async function startSprint(id: string) {
    await fetch('/api/solo/sprints/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sprintId: id, storyIds: [] }) });
    await refresh();
  }

  async function completeSprint(id: string) {
    await fetch('/api/solo/sprints/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sprintId: id, storyIds: [] }) });
    await refresh();
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Sprints</h1>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <input placeholder="Name" className="bg-zinc-900 border rounded p-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Goal" className="bg-zinc-900 border rounded p-2" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        <input type="date" className="bg-zinc-900 border rounded p-2" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
        <input type="date" className="bg-zinc-900 border rounded p-2" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        <div className="flex gap-2">
          <input type="number" min={1} className="w-24 bg-zinc-900 border rounded p-2" value={form.capacity_points} onChange={(e) => setForm({ ...form, capacity_points: Number(e.target.value) })} />
          <button className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3" onClick={createSprint}>Create</button>
        </div>
      </div>

      <ul className="space-y-2">
        {sprints.map((s) => (
          <li key={s.id} className="border border-zinc-800 rounded p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-zinc-400">{s.start_date} → {s.end_date}</div>
              </div>
              <div className="text-xs">
                <span className="px-2 py-1 rounded bg-zinc-800">{s.status}</span>
              </div>
            </div>
            {s.status !== 'active' && s.status !== 'completed' && (
              <button className="text-sm text-blue-500 mt-2" onClick={() => startSprint(s.id)}>Start</button>
            )}
            {s.status === 'active' && (
              <button className="text-sm text-green-500 mt-2" onClick={() => completeSprint(s.id)}>Complete</button>
            )}
            {s.status === 'completed' && (
              <div className="text-xs text-zinc-400 mt-2">Velocity: {s.velocity ?? 0}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}



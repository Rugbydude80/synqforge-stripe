"use client";
import { BurndownLine } from '@/components/analytics/Charts';
import { useState } from 'react';
import { toast } from '@/components/ui/Toasts/use-toast';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

type Sprint = {
  id: string;
  project_id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: string;
  capacity_points?: number | null;
  story_points_completed?: number | null;
  velocity?: number | null;
};

type Retro = { id: string; summary: string | null; notes: string | null; tags: any; created_at: string };

export default function SprintDetailClient({
  sprint,
  stories,
  retros,
  burndown
}: {
  sprint: Sprint;
  stories: Array<{ id: string; title: string; status: string; points: number | null; updated_at: string | null }>;
  retros: Retro[];
  burndown: Array<{ date: string; remaining: number }>;
}) {
  const supabase = createSupabaseBrowserClient();
  const [retrosData, setRetrosData] = useState<Retro[]>(retros);
  const [newTag, setNewTag] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const addTag = async (retroId: string) => {
    const retro = retrosData.find((r) => r.id === retroId);
    if (!retro) return;
    const tags = Array.isArray(retro.tags) ? retro.tags : Object.values(retro.tags || {});
    const next = [...tags, newTag].filter(Boolean);
    const { error } = await supabase.from('retrospectives').update({ tags: next as unknown as Record<string, unknown> }).eq('id', retroId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to add tag' });
      return;
    }
    setRetrosData((prev) => prev.map((r) => (r.id === retroId ? { ...r, tags: next } as any : r)));
    setNewTag('');
  };

  const addNotes = async (retroId: string) => {
    const { error } = await supabase.from('retrospectives').update({ notes: newNotes }).eq('id', retroId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to save notes' });
      return;
    }
    setRetrosData((prev) => prev.map((r) => (r.id === retroId ? { ...r, notes: newNotes } : r)));
    setNewNotes('');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {sprint.name} <span className="text-xs text-zinc-500">[{sprint.status}]</span>
          </h1>
          <div className="text-sm text-zinc-600">{sprint.start_date} → {sprint.end_date}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded border p-4 bg-white dark:bg-zinc-900">
          <h2 className="font-semibold mb-2">Goal</h2>
          <p className="text-sm">{sprint.goal || '—'}</p>
        </div>
        <div className="rounded border p-4 bg-white dark:bg-zinc-900">
          <h2 className="font-semibold mb-2">Capacity (pts)</h2>
          <p className="text-sm">{sprint.capacity_points ?? 0}</p>
        </div>
        <div className="rounded border p-4 bg-white dark:bg-zinc-900">
          <h2 className="font-semibold mb-2">Velocity / Completed</h2>
          <p className="text-sm">{(sprint.velocity ?? 0).toFixed(2)} pts/day • {sprint.story_points_completed ?? 0} pts</p>
        </div>
      </div>

      <section className="rounded border p-4 bg-white dark:bg-zinc-900">
        <h2 className="font-semibold mb-2">Burndown</h2>
        <BurndownLine data={burndown} />
      </section>

      <section className="rounded border p-4 bg-white dark:bg-zinc-900">
        <h2 className="font-semibold mb-3">Completed Retrospectives</h2>
        {retrosData.length === 0 && <p className="text-sm text-zinc-500">No retrospectives yet.</p>}
        <ul className="space-y-4">
          {retrosData.map((r) => (
            <li key={r.id} className="rounded border p-3">
              <div className="text-sm text-zinc-600">{new Date(r.created_at).toLocaleString()}</div>
              <div className="font-medium">{r.summary || '—'}</div>
              <div className="text-sm text-zinc-600 whitespace-pre-wrap">{r.notes || '—'}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {(Array.isArray(r.tags) ? r.tags : Object.values(r.tags || {})).map((t: any, i: number) => (
                  <span key={i} className="px-2 py-0.5 text-xs rounded bg-zinc-200 dark:bg-zinc-800">
                    {String(t)}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input aria-label="Add tag" className="rounded border p-1 text-sm" placeholder="Tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                <button className="text-sm px-2 py-1 rounded bg-blue-600 text-white" onClick={() => addTag(r.id)}>
                  Add tag
                </button>
                <input aria-label="Notes" className="rounded border p-1 text-sm flex-1" placeholder="Notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
                <button className="text-sm px-2 py-1 rounded bg-emerald-600 text-white" onClick={() => addNotes(r.id)}>
                  Save notes
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}



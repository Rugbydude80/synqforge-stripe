'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { ToastProvider, ToastViewport } from '@/components/ui/Toasts/toast';

type Candidate = {
  id: string;
  title: string;
  points: number;
  priority: 'low' | 'medium' | 'high';
  acceptance_criteria: string[];
  status: 'proposed' | 'accepted' | 'discarded';
};

export default function GeneratePage() {
  const supabase = createSupabaseBrowserClient();
  const [clients, setClients] = useState<any[]>([]);
  const [ingests, setIngests] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | ''>('');
  const [ingestId, setIngestId] = useState<string | ''>('');
  const [style, setStyle] = useState<'concise' | 'detailed'>('concise');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
      setClients(cs || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!clientId) { setIngests([]); return; }
      const { data: ins } = await supabase.from('ingests').select('id, filename, created_at').eq('client_id', clientId).order('created_at', { ascending: false });
      setIngests(ins || []);
    })();
  }, [clientId]);

  async function onGenerate() {
    if (!clientId || !ingestId) { console.warn('Select a client and ingest'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/extract-stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, ingestId, style, enforceSchema: true }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'AI error');
      const { data } = await supabase.from('story_candidates').select('*').eq('ingest_id', ingestId).order('created_at', { ascending: false });
      setCandidates((data as any[]) as Candidate[] || []);
    } catch (e: any) {
      console.error('Failed to generate stories', e);
    } finally {
      setLoading(false);
    }
  }

  async function updateCandidate(id: string, patch: Partial<Candidate>) {
    await supabase.from('story_candidates').update(patch as any).eq('id', id);
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } as Candidate : c)));
  }

  async function acceptCandidate(id: string) {
    const cand = candidates.find((c) => c.id === id);
    if (!cand) return;
    // Insert into stories (project/epic/sprint null), status backlog
    await supabase.from('stories').insert({ title: cand.title, description: (cand.acceptance_criteria || []).join('\n'), status: 'backlog', points: cand.points ?? 0, priority: cand.priority === 'high' ? 3 : cand.priority === 'medium' ? 2 : 1, project_id: null as any, epic_id: null as any, sprint_id: null as any, ingest_id: ingestId || null, ai_generated: true });
    await updateCandidate(id, { status: 'accepted' });
    // Notify
    fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'story_candidate_accepted', data: { candidateId: id, title: cand.title } }) });
  }

  async function discardCandidate(id: string) {
    await updateCandidate(id, { status: 'discarded' });
    fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'story_candidate_discarded', data: { candidateId: id } }) });
  }

  async function acceptAll() {
    for (const c of candidates.filter((c) => c.status === 'proposed')) {
      // eslint-disable-next-line no-await-in-loop
      await acceptCandidate(c.id);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Generate user stories</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <label className="text-sm">
          <div className="mb-1">Client</div>
          <select className="w-full bg-zinc-900 border rounded p-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1">Ingest</div>
          <select className="w-full bg-zinc-900 border rounded p-2" value={ingestId} onChange={(e) => setIngestId(e.target.value)}>
            <option value="">Select…</option>
            {ingests.map((i) => (
              <option key={i.id} value={i.id}>{i.filename || i.id}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1">Style</div>
          <select className="w-full bg-zinc-900 border rounded p-2" value={style} onChange={(e) => setStyle(e.target.value as any)}>
            <option value="concise">Concise</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <button onClick={onGenerate} disabled={loading} className="h-9 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm px-4">{loading ? 'Generating…' : 'Generate Stories'}</button>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium">Story candidates</h2>
          <button onClick={acceptAll} className="text-sm text-blue-500">Accept all</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Points</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Acceptance criteria</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-t border-zinc-800">
                  <td className="py-2 pr-4">
                    <input className="w-full bg-transparent border rounded p-1" value={c.title} onChange={(e) => setCandidates((prev) => prev.map((x) => x.id === c.id ? { ...x, title: e.target.value } : x))} onBlur={() => updateCandidate(c.id, { title: c.title } as any)} />
                  </td>
                  <td className="py-2 pr-4 w-24">
                    <input type="number" min={1} max={13} className="w-20 bg-transparent border rounded p-1" value={c.points ?? 0} onChange={(e) => setCandidates((prev) => prev.map((x) => x.id === c.id ? { ...x, points: Number(e.target.value) } : x))} onBlur={() => updateCandidate(c.id, { points: c.points } as any)} />
                  </td>
                  <td className="py-2 pr-4 w-32">
                    <select className="w-28 bg-transparent border rounded p-1" value={c.priority} onChange={(e) => { const v = e.target.value as Candidate['priority']; setCandidates((prev) => prev.map((x) => x.id === c.id ? { ...x, priority: v } : x)); }} onBlur={() => updateCandidate(c.id, { priority: c.priority } as any)}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <textarea className="w-full bg-transparent border rounded p-1" rows={2} value={(c.acceptance_criteria || []).join('\n')} onChange={(e) => setCandidates((prev) => prev.map((x) => x.id === c.id ? { ...x, acceptance_criteria: e.target.value.split('\n').filter(Boolean) } : x))} onBlur={() => updateCandidate(c.id, { acceptance_criteria: c.acceptance_criteria } as any)} />
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <button className="text-green-500 mr-3" onClick={() => acceptCandidate(c.id)}>Accept</button>
                    <button className="text-red-500" onClick={() => discardCandidate(c.id)}>Discard</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



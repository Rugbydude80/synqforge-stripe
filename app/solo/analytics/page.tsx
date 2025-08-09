'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

export default function SoloAnalyticsPage() {
  const supabase = createSupabaseBrowserClient();
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => { (async () => {
    const { data: cs } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients(cs || []);
  })(); }, []);

  useEffect(() => { (async () => {
    if (!clientId) { setData(null); return; }
    const res = await fetch(`/api/solo/analytics?clientId=${clientId}`);
    const json = await res.json();
    setData(json);
  })(); }, [clientId]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Analytics</h1>
      <select className="bg-zinc-900 border rounded p-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
        <option value="">Client…</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {data && (
        <div className="text-sm space-y-4">
          <div>
            <div className="font-medium">Sprint velocities</div>
            <ul className="list-disc pl-5">
              {data.velocityPerSprint.map((v: any) => (
                <li key={v.sprintId}>#{v.sprintId.slice(0, 6)} — {v.points} points over {v.duration} days</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-medium">Points by status</div>
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(data.pointsByStatus).map(([k, v]: any) => (
                <li key={k} className="border border-zinc-800 rounded p-2">{k}: {v}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-medium">Current burndown</div>
            <ul className="list-disc pl-5">
              {data.currentBurndown.map((b: any) => (
                <li key={b.date}>{b.date}: {b.remaining} remaining</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}



'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';

export default function PlanningPage() {
  const supabase = createSupabaseBrowserClient();
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [capacity, setCapacity] = useState(20);
  const [plan, setPlan] = useState<any | null>(null);

  useEffect(() => { (async () => {
    const { data: cs } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients(cs || []);
  })(); }, []);

  async function runPlan() {
    if (!clientId) return;
    const res = await fetch('/api/solo/ai/sprint-planning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, capacity_points: capacity }) });
    const json = await res.json();
    setPlan(json);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Sprint planning</h1>
      <div className="flex gap-2 items-end">
        <select className="bg-zinc-900 border rounded p-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" className="w-24 bg-zinc-900 border rounded p-2" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
        <button className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3" onClick={runPlan}>Recommend</button>
      </div>
      {plan && (
        <div className="space-y-2">
          <div className="text-sm text-zinc-400">Total points: {plan.total_points} · Velocity estimate: {plan.velocity_estimate?.toFixed?.(2) ?? plan.velocity_estimate}</div>
          <div>
            <div className="font-medium mb-1">Suggested order</div>
            <ol className="list-decimal pl-5 text-sm space-y-1">
              {plan.suggested_order?.map((id: string) => <li key={id}>{id}</li>)}
            </ol>
          </div>
          {plan.risks?.length > 0 && (
            <div>
              <div className="font-medium mb-1">Risks</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {plan.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



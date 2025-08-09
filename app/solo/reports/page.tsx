'use client';

import { useEffect, useState } from 'react';

export default function ReportsPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    const res = await fetch('/api/solo/reports');
    const json = await res.json();
    setReports(Array.isArray(json) ? json : []);
  }
  useEffect(() => { refresh(); }, []);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch('/api/solo/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) await refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Client reports</h1>
        <button className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate new'}</button>
      </div>
      <ul className="space-y-2 text-sm">
        {reports.map((r) => (
          <li key={r.id} className="border border-zinc-800 rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{r.title || 'Weekly report'}</div>
              <div className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleString()}</div>
            </div>
            <div className="space-x-2">
              <a className="text-blue-500" href={`/api/solo/reports/pdf?id=${r.id}`}>Download PDF</a>
              <a className="text-blue-500" href={`/api/solo/reports?id=${r.id}`}>View JSON</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}



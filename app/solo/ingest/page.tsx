'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
// Use console-based fallback to avoid coupling to Toast primitives here

export default function IngestPage() {
  const supabase = createSupabaseBrowserClient();
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | ''>('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ingests, setIngests] = useState<any[]>([]);

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

  async function onPaste() {
    if (!clientId || !text.trim()) { console.warn('Provide client and text'); return; }
    const res = await fetch('/api/ingest/paste', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, text }) });
    const json = await res.json();
    if (!res.ok) { console.error('Paste failed', json.error); return; }
    setText('');
    const { data: ins } = await supabase.from('ingests').select('id, filename, created_at').eq('client_id', clientId).order('created_at', { ascending: false });
    setIngests(ins || []);
  }

  async function onUpload() {
    if (!clientId || !file) { console.warn('Select client and file'); return; }
    const fd = new FormData();
    fd.append('clientId', clientId);
    fd.append('file', file);
    const res = await fetch('/api/ingest/upload', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) { console.error('Upload failed', json.error); return; }
    setFile(null);
    const { data: ins } = await supabase.from('ingests').select('id, filename, created_at').eq('client_id', clientId).order('created_at', { ascending: false });
    setIngests(ins || []);
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-semibold">Ingest notes</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <label className="text-sm">
          <div className="mb-1">Client</div>
          <select className="w-full bg-zinc-900 border rounded p-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="md:col-span-2 text-sm">
          <div className="mb-1">Upload file</div>
          <div className="flex gap-2">
            <input type="file" accept=".txt,.md,.csv,.json,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3" onClick={onUpload}>Upload</button>
          </div>
          <div className="text-xs text-zinc-500 mt-1">Supported: pdf, docx, txt, md, csv, json</div>
        </div>
      </div>

      <div className="text-sm">
        <div className="mb-1">Or paste notes</div>
        <textarea className="w-full bg-zinc-900 border rounded p-2 min-h-[160px]" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2">
          <button className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1" onClick={onPaste}>Save paste</button>
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-2">Recent ingests</h2>
        <ul className="text-sm space-y-1">
          {ingests.map((i) => (
            <li key={i.id} className="text-zinc-400">{i.filename || 'Paste'} — {new Date(i.created_at).toLocaleString()}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}



import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Very lightweight, stores reports in-memory in Demo Mode; with Supabase, you may persist in a table later.
const mem: { reports: Array<any> } = { reports: [] };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (id) {
    const one = mem.reports.find((r) => r.id === id);
    return NextResponse.json(one || null);
  }
  return NextResponse.json(mem.reports.slice(-50).reverse());
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  // Minimal payload; in a follow-up we will compile full report (scope changes, velocity, ETA, next sprint)
  const id = Math.random().toString(36).slice(2);
  const report = { id, title: 'Weekly report', created_at: new Date().toISOString(), data: { note: 'stub' } };
  mem.reports.push(report);
  return NextResponse.json({ reportId: id, shareUrl: `/api/solo/reports?id=${id}` });
}



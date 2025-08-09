import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { sprintId, storyIds } = body as { sprintId: string; storyIds: string[] };

  if (!sprintId) return NextResponse.json({ error: 'sprintId required' }, { status: 400 });

  await supabase.from('sprints').update({ status: 'active' }).eq('id', sprintId);
  if (Array.isArray(storyIds) && storyIds.length > 0) {
    await supabase.from('stories').update({ status: 'in_progress', sprint_id: sprintId }).in('id', storyIds);
  }
  return NextResponse.json({ ok: true });
}



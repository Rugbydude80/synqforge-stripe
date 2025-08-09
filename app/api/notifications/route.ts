import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

// GET: list notifications (optionally only unread)
export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const unread = searchParams.get('unread') === 'true';
  let query = supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (unread) query = query.eq('read', false);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: create a notification for the current user (or specified user if allowed by RLS)
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { userId?: string; type?: string; data?: any };
  const userId = (body.userId || user.id) as string;
  const type = (body.type || '').trim();
  const data = body.data ?? {};
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  const { data: inserted, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, data })
    .select('*')
    .maybeSingle();
  if (error || !inserted) return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 });
  return NextResponse.json(inserted);
}

// PUT: mark notifications as read
export async function PUT(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: 'No ids' }, { status: 400 });
  const { error } = await supabase.from('notifications').update({ read: true }).in('id', ids).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  return NextResponse.json({ ok: true });
}



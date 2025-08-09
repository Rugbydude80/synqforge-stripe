import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const body = await req.json().catch(() => ({}));
  const { clientId, text, meta } = body || {};
  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('ingests')
    .insert({ client_id: clientId ?? null, source_type: 'paste', raw_text: text, meta: meta ?? {}, created_by: user.id })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingestId: data.id });
}



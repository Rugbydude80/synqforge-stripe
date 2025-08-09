import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { parseToText } from '@/lib/ingest/parse';
import { uploadToSupabase } from '@/lib/ingest/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const form = await req.formData();
  const file = form.get('file');
  const clientId = form.get('clientId') as string | null;
  const filename = typeof file === 'object' && 'name' in (file as any) ? (file as File).name : undefined;
  const mimeType = typeof file === 'object' && 'type' in (file as any) ? (file as File).type : undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Upload raw file to storage (best-effort; ignore errors in demo)
  await uploadToSupabase(user.id, file, filename);
  const raw_text = await parseToText(file, mimeType);

  const { data, error } = await supabase
    .from('ingests')
    .insert({
      client_id: clientId,
      source_type: 'upload',
      filename,
      mime_type: mimeType,
      raw_text,
      created_by: user.id
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingestId: data.id });
}



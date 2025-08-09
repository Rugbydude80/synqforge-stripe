import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'application/pdf', 'text/plain']);

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Expect multipart/form-data: fields storyId, file
  const formData = await req.formData();
  const storyId = String(formData.get('storyId') || '').trim();
  const file = formData.get('file') as File | null;
  if (!storyId || !file) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large' }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 415 });

  // Upload to Supabase Storage (bucket: attachments)
  const arrayBuffer = await file.arrayBuffer();
  const fileName = `${user.id}/${storyId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(fileName, arrayBuffer, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });

  const { data: pub } = supabase.storage.from('attachments').getPublicUrl(fileName);
  const fileUrl = pub.publicUrl;

  const { data: inserted, error: insertError } = await supabase
    .from('story_attachments')
    .insert({ story_id: storyId, user_id: user.id, file_name: file.name, file_url: fileUrl })
    .select('*')
    .maybeSingle();
  if (insertError || !inserted) return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 });

  return NextResponse.json(inserted);
}



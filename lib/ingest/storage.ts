import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

/** Upload a file into private 'ingest' bucket. Returns storage path or null on failure. */
export async function uploadToSupabase(userId: string, file: File, filename?: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const ext = (filename || file.name || 'upload').split('.').pop();
    const path = `ingest/${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await (supabase as any).storage.from('ingest').upload(path, file, { upsert: false, contentType: (file as any).type || undefined });
    if (error) return null;
    return path;
  } catch (_e) {
    return null;
  }
}



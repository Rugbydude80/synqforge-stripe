import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import '@/lib/env';
// Use the extended Database type that includes SynqForge tables. See
// '@/types/extended-db' for details.
import type { Database } from '@/types/extended-db';
import { isDemoMode } from '@/lib/env';
import crypto from 'crypto';

// Shared in-memory store for Demo Mode across server requests
let demoStore: Record<string, any[]> | null = null;

// Define a function to create a Supabase client for server-side operations
// The function takes a cookie store created with next/headers cookies as an argument
export const createClient = () => {
  const cookieStore = cookies();
  if (isDemoMode()) {
    // Very small in-memory adapter for server-side usage in Demo Mode
    if (!demoStore)
      demoStore = {
        clients: [],
        ingests: [],
        story_candidates: [],
        stories: [],
        projects: [],
        project_members: [],
        users: [],
        user_profiles: [],
        sprints: [],
        story_watchers: [],
        story_attachments: [],
        notifications: []
      } as Record<string, any[]>;
    const store: Record<string, any[]> = demoStore;
    const ensure = (name: string) => {
      if (!store[name]) store[name] = [];
      return store[name];
    };
    const table = (name: string) => ({
      select: async () => ({ data: store[name], error: null }),
      insert: async (records: any | any[]) => {
        const arr = Array.isArray(records) ? records : [records];
        const withIds = arr.map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
        ensure(name).push(...withIds);
        return { data: withIds, error: null };
      },
      update: (patch: any) => ({
        eq: async (col: string, val: any) => {
          const rows = ensure(name);
          const idx = rows.findIndex((r: any) => r[col] === val);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...patch };
          return { data: idx >= 0 ? [rows[idx]] : [], error: null };
        }
      }),
      delete: () => ({
        eq: async (col: string, val: any) => {
          const rows = ensure(name);
          const before = rows.length;
          store[name] = rows.filter((r: any) => r[col] !== val);
          const deleted = before - store[name]!.length;
          return { data: { deleted }, error: null };
        }
      })
    });
    return {
      from: (t: string) => table(t),
      auth: {
        getUser: async () => ({ data: { user: { id: 'demo-user' } }, error: null })
      }
    } as unknown as ReturnType<typeof createServerClient<Database>>;
  }
  return createServerClient<Database>(
    // Pass Supabase URL and anonymous key from the environment to the client
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,

    // Define a cookies object with methods for interacting with the cookie store and pass it to the client
    {
      cookies: {
        // The get method is used to retrieve a cookie by its name
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // The set method is used to set a cookie with a given name, value, and options
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // If the set method is called from a Server Component, an error may occur
            // This can be ignored if there is middleware refreshing user sessions
          }
        },
        // The remove method is used to delete a cookie by its name
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // If the remove method is called from a Server Component, an error may occur
            // This can be ignored if there is middleware refreshing user sessions
          }
        }
      }
    }
  );
};

'use client';

import Link from 'next/link';
import { SignOut } from '@/utils/auth-helpers/server';
import { handleRequest } from '@/utils/auth-helpers/client';
import Logo from '@/components/icons/Logo';
import { usePathname, useRouter } from 'next/navigation';
import { getRedirectMethod } from '@/utils/auth-helpers/settings';
import s from './Navbar.module.css';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { isFreelancerMode, billingOn } from '@/lib/env';

interface NavlinksProps {
  user?: any;
}

export default function Navlinks({ user }: NavlinksProps) {
  const router = getRedirectMethod() === 'client' ? useRouter() : null;
  const supabase = createSupabaseBrowserClient();
  const [unread, setUnread] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const res = await fetch('/api/notifications?unread=true');
      const data = await res.json();
      if (active) setUnread(data || []);
    })();
    // subscribe to realtime notifications table for this user
    if (user) {
      const channel = supabase.channel(`notifications:${user.id}`);
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
          setUnread((prev) => [payload.new as any, ...prev]);
        })
        .subscribe();
      return () => {
        active = false;
        channel.unsubscribe();
      };
    }
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  return (
    <div className="relative flex flex-row justify-between py-4 align-center md:py-6">
      <div className="flex items-center flex-1">
        <Link href="/" className={s.logo} aria-label="Logo">
          <Logo />
        </Link>
        <nav className="ml-6 space-x-2 lg:block">
          {billingOn && (
            <Link href="/" className={s.link}>
              Pricing
            </Link>
          )}
          {user && (
            <>
              <Link href="/backlog" className={s.link}>
                Backlog
              </Link>
              <Link href="/epics" className={s.link}>
                Epics
              </Link>
              <Link href="/sprint" className={s.link}>
                Sprint
              </Link>
              <Link href="/analytics" className={s.link}>
                Analytics
              </Link>
              <Link href="/retrospectives" className={s.link}>
                Retrospectives
              </Link>
              <Link href="/account" className={s.link}>
                Account
              </Link>
              {isFreelancerMode() && (
                <span className="inline-flex items-center gap-1 ml-2 text-zinc-500">|</span>
              )}
              {isFreelancerMode() && (
                <>
                  <Link href="/solo/ingest" className={s.link}>
                    Freelancer: Ingest
                  </Link>
                  <Link href="/solo/generate" className={s.link}>
                    Generate
                  </Link>
                  <Link href="/solo/backlog" className={s.link}>
                    Solo Backlog
                  </Link>
                  <Link href="/solo/sprints" className={s.link}>
                    Sprints
                  </Link>
                  <Link href="/solo/planning" className={s.link}>
                    Planning
                  </Link>
                  <Link href="/solo/analytics" className={s.link}>
                    Analytics
                  </Link>
                </>
              )}
            </>
          )}
        </nav>
      </div>
      <div className="flex justify-end space-x-8">
        {user ? (
          <form onSubmit={(e) => handleRequest(e, SignOut, router)}>
            <input type="hidden" name="pathName" value={usePathname()} />
            <button type="submit" className={s.link}>
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/signin" className={s.link}>
            Sign In
          </Link>
        )}
        {user && (
          <div className="relative" ref={popoverRef}>
            <button aria-label="Notifications" className="inline-flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
              <Bell className="w-5 h-5" />
              {unread.length > 0 && (
                <span className="ml-1 inline-block min-w-[1rem] text-center text-[10px] px-1 rounded-full bg-red-600 text-white" aria-label={`${unread.length} unread notifications`}>
                  {unread.length}
                </span>
              )}
            </button>
            {open && (
              <div role="dialog" aria-label="Notifications" className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto bg-white dark:bg-zinc-800 border rounded shadow p-2 z-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium text-sm">Notifications</div>
                  {unread.length > 0 && (
                    <button
                      className="text-xs text-blue-600"
                      onClick={async () => {
                        const ids = unread.map((n: any) => n.id);
                        await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
                        setUnread([]);
                      }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {unread.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-2">No unread notifications.</div>
                ) : (
                  <ul className="space-y-1">
                    {unread.map((n: any) => (
                      <li key={n.id} className="text-xs p-2 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700">
                        <div className="font-medium">{n.type}</div>
                        {n.data?.message && <div className="text-zinc-600 dark:text-zinc-300">{n.data.message}</div>}
                        <div className="text-[10px] text-zinc-400">{new Date(n.created_at).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

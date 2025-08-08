import { inngest } from '@/lib/inngest';
import { createClient } from '@/utils/supabase/server';

export default async function AnalyticsExportPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  async function trigger() {
    'use server';
    const supabase = createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    await inngest.send({ name: 'analytics.export.requested', data: { userId: user.id } });
  }

  return (
    <form action={trigger} className="p-6">
      <button
        type="submit"
        className="rounded bg-white/10 px-4 py-2 text-white hover:bg-white/20"
        disabled={!user}
      >
        Request Analytics Export
      </button>
      {!user && <p className="mt-2 text-sm text-zinc-400">Sign in to export.</p>}
    </form>
  );
}



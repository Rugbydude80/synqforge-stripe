import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/env';

/**
 * BacklogPage
 *
 * This server component fetches the first available project for the
 * currently authenticated user and renders the Kanban board for it.
 * If the user is not signed in they will be redirected to the sign in
 * page. If no projects exist the user sees a simple placeholder.
 */
export default async function BacklogPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !isDemoMode()) {
    redirect('/signin');
  }
  // Fetch the user profile to determine organisation membership. We need
  // organisation_id to query projects. If no profile exists we can't
  // continue.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', (user as any)?.id || 'demo-user')
    .single();
  if (!profile && isDemoMode()) {
    // Create demo org/project so the board works in-memory
    const orgId = 'demo-org';
    await (supabase as any).from('projects').insert({ id: 'demo-project', organisation_id: orgId, name: 'Demo Project' });
    await (supabase as any).from('user_profiles').insert({ user_id: 'demo-user', organisation_id: orgId, role: 'owner' });
  } else if (!profile) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-4">Backlog</h1>
        <p>You are not associated with any organisation. Please contact your administrator.</p>
      </div>
    );
  }
  // Fetch the first project for this organisation. In a complete app
  // you could allow selecting between multiple projects. Here we simply
  // choose the first project by creation time.
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organisation_id', (profile as any)?.organisation_id || 'demo-org')
    .order('created_at', { ascending: true })
    .limit(1);
  const project = projects?.[0];
  if (!project) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-4">Backlog</h1>
        <p>No projects found. Create a project to start managing your backlog.</p>
      </div>
    );
  }
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">{project.name} – Backlog</h1>
      {/* Render the client‑side Kanban board for this project */}
      <KanbanBoard projectId={project.id} />
    </div>
  );
}
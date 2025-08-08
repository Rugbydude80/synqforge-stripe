import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { SprintPlanning } from '@/components/sprint/SprintPlanning';
import { redirect } from 'next/navigation';

/**
 * Sprint Planning Page
 *
 * This server component loads the first available project for the current
 * user and renders the SprintPlanning client component for that project.
 */
export default async function SprintPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/signin');
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', user!.id)
    .single();
  if (!profile) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-4">Sprint Planning</h1>
        <p>You are not associated with any organisation.</p>
      </div>
    );
  }
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: true })
    .limit(1);
  const project = projects?.[0];
  if (!project) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold mb-4">Sprint Planning</h1>
        <p>No projects found.</p>
      </div>
    );
  }
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">{project.name} – Sprint Planning</h1>
      <SprintPlanning projectId={project.id} />
    </div>
  );
}
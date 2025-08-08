import { redirect } from 'next/navigation';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import RetrospectivesManager from './RetrospectivesManagerClient';

// Server component to prepare data for the retrospectives page.  It
// authenticates the user, fetches their organisation and the first
// project, and passes identifiers to the client component.  If no
// sprints exist the page will still allow generating retrospectives
// once a sprint is created.

export default async function RetrospectivesPage() {
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
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.organisation_id) {
    return <div className="p-6">You are not a member of any organisation.</div>;
  }
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!project) {
    return <div className="p-6">No projects found for this organisation.</div>;
  }
  return <RetrospectivesManager projectId={project.id} organisationId={profile.organisation_id} />;
}
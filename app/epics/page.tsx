import { redirect } from 'next/navigation';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import EpicsManager from './EpicsManagerClient';

// Server component to load the current user's organisation and project
// and render the client-side epics manager.  If the user is not
// authenticated or does not belong to an organisation or project,
// appropriate redirects or messages are shown.  The actual UI for
// viewing and generating epics lives in the EpicsManager component
// defined below in the same file.

export default async function EpicsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/signin');
  }
  // Fetch the user's organisation
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('organisation_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.organisation_id) {
    return <div className="p-6">You are not a member of any organisation.</div>;
  }
  // Fetch the first project in the organisation.  In a multi-project
  // environment you may want to select a specific project via route
  // params; here we default to the first for simplicity.
  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('organisation_id', profile.organisation_id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!project) {
    return <div className="p-6">No projects found for this organisation.</div>;
  }
  return <EpicsManager projectId={project.id} organisationId={profile.organisation_id} />;
}
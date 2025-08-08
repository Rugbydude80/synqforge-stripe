import { redirect } from 'next/navigation';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';

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

// -------------------------------------------------------------------
// Client component that displays existing retrospectives and allows
// generating a retrospective for a selected sprint.  It fetches
// sprints and retrospectives from Supabase and calls the AI
// retrospective endpoint to create new ones.  The UI is simple: a
// drop‑down to choose a sprint and a button to generate, plus a
// listing of existing retrospectives.
// -------------------------------------------------------------------

/* eslint-disable react-hooks/rules-of-hooks */
// The `use client` directive is required for React client components
// inside a file that also exports a server component.
// @ts-ignore
"use client";
import { useState, useEffect } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { toast } from '@/components/ui/Toasts/use-toast';

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: string;
}
interface Retrospective {
  id: string;
  sprint_id: string;
  summary: string | null;
  notes: string | null;
  tags?: Record<string, string[]> | null;
  created_at: string | null;
}

function RetrospectivesManager({ projectId, organisationId }: { projectId: string; organisationId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [retros, setRetros] = useState<Retrospective[]>([]);
  const [selectedSprint, setSelectedSprint] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Retrospective>>({});

  // Load sprints and retrospectives from Supabase
  const refreshData = async () => {
    const { data: sprintsData, error: sprintsError } = await supabase
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('start_date', { ascending: true });
    if (sprintsError) {
      // eslint-disable-next-line no-console
      console.error('Failed to load sprints', sprintsError);
      toast({ title: 'Error', description: 'Failed to load sprints' });
    } else {
      setSprints(sprintsData || []);
    }
    const { data: retrosData, error: retrosError } = await supabase
      .from('retrospectives')
      .select('*')
      .in('sprint_id', (sprintsData || []).map((s) => s.id));
    if (retrosError) {
      // eslint-disable-next-line no-console
      console.error('Failed to load retrospectives', retrosError);
      toast({ title: 'Error', description: 'Failed to load retrospectives' });
    } else {
      setRetros(retrosData || []);
    }
  };
  useEffect(() => {
    void refreshData();
    // Subscribe to realtime updates for sprints and retrospectives
    const channel = supabase.channel(`retrospectives:${projectId}`);
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sprints', filter: `project_id=eq.${projectId}` },
        () => void refreshData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'retrospectives' },
        () => void refreshData()
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Generate a retrospective for the selected sprint
  const handleGenerate = async () => {
    if (!selectedSprint) {
      toast({ title: 'Error', description: 'Please select a sprint' });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-retrospective', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintId: selectedSprint, organisationId })
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Error', description: data.error || 'Failed to generate retrospective' });
      } else {
        toast({ title: 'Success', description: 'Retrospective generated' });
        // Refresh retrospectives to include the newly created one
        void refreshData();
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast({ title: 'Error', description: 'Failed to generate retrospective' });
    } finally {
      setGenerating(false);
    }
  };

  const saveRetro = async () => {
    if (!editing) return;
    const payload: any = { summary: editForm.summary ?? null, notes: editForm.notes ?? null, tags: editForm.tags ?? null };
    const { error } = await supabase.from('retrospectives').update(payload).eq('id', editing);
    if (error) {
      toast({ title: 'Error', description: 'Failed to save retrospective' });
    } else {
      toast({ title: 'Saved', description: 'Retrospective updated' });
      setEditing(null);
      setEditForm({});
      void refreshData();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Sprint Retrospectives</h1>
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
          <select
            value={selectedSprint}
            onChange={(e) => setSelectedSprint(e.target.value)}
            className="border rounded p-2"
          >
            <option value="" disabled>
              Select sprint
            </option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name} ({sprint.start_date} → {sprint.end_date})
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating || !selectedSprint}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate Retrospective'}
          </button>
        </div>
      </div>
      <div className="space-y-4">
        {retros.length > 0 ? (
          retros.map((retro) => {
            const sprint = sprints.find((s) => s.id === retro.sprint_id);
            return (
              <div key={retro.id} className="border rounded p-4 bg-white dark:bg-zinc-800">
                <h2 className="font-semibold text-lg">
                  Retrospective: {sprint ? sprint.name : 'Unknown Sprint'}
                </h2>
                {editing === retro.id ? (
                  <div className="space-y-2 mt-2">
                    <textarea className="w-full rounded border p-2 text-sm" rows={3} value={editForm.summary ?? retro.summary ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))} />
                    <textarea className="w-full rounded border p-2 text-sm" rows={6} value={editForm.notes ?? retro.notes ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {['what_went_well', "what_didnt", 'ideas'].map((k) => (
                        <input key={k} className="w-full rounded border p-2 text-xs" placeholder={`${k.replace('_', ' ')} (comma separated)`}
                          value={((editForm.tags ?? retro.tags ?? {}) as any)[k]?.join(',') ?? ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, tags: { ...(f.tags ?? retro.tags ?? {}), [k]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } as any }))}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button className="text-sm px-2 py-1 rounded border" onClick={() => { setEditing(null); setEditForm({}); }}>Cancel</button>
                      <button className="text-sm px-2 py-1 rounded bg-blue-600 text-white" onClick={saveRetro}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {retro.summary && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                        <strong>Summary:</strong> {retro.summary}
                      </p>
                    )}
                    {retro.notes && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                        <strong>Notes:</strong> {retro.notes}
                      </p>
                    )}
                    {retro.tags && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-2 space-y-1">
                        {Object.entries(retro.tags as Record<string, string[]>).map(([k, v]) => (
                          <div key={k}><strong>{k}:</strong> {v.join(', ')}</div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end mt-2">
                      <button className="text-sm text-blue-600" onClick={() => { setEditing(retro.id); setEditForm({ summary: retro.summary ?? '', notes: retro.notes ?? '', tags: retro.tags ?? {} }); }}>Edit</button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Generated {retro.created_at ? new Date(retro.created_at).toLocaleString() : ''}
                </p>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">No retrospectives yet.</p>
        )}
      </div>
    </div>
  );
}
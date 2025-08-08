"use client";
/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useEffect } from 'react';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { toast } from '@/components/ui/Toasts/use-toast';

interface Epic {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tasks: Story[];
}
interface Story {
  id: string;
  title: string;
  description: string | null;
  status: string;
  epic_id: string | null;
  sprint_id: string | null;
}

export default function EpicsManager({ projectId, organisationId }: { projectId: string; organisationId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [epics, setEpics] = useState<Epic[]>([]);
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);
  // Fetch existing epics and tasks from Supabase
  const refreshEpics = async () => {
    const { data: epicsData, error: epicsError } = await supabase
      .from('epics')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (epicsError) {
      // eslint-disable-next-line no-console
      console.error('Failed to load epics', epicsError);
      toast({ title: 'Error', description: 'Failed to load epics' });
      return;
    }
    const { data: storiesData, error: storiesError } = await supabase
      .from('stories')
      .select('*')
      .eq('project_id', projectId);
    if (storiesError) {
      // eslint-disable-next-line no-console
      console.error('Failed to load stories', storiesError);
      toast({ title: 'Error', description: 'Failed to load stories' });
      return;
    }
    const tasksByEpic: Record<string, Story[]> = {};
    (storiesData || []).forEach((story: any) => {
      const epicId = story.epic_id as string | null;
      if (!epicId) return;
      if (!tasksByEpic[epicId]) tasksByEpic[epicId] = [];
      tasksByEpic[epicId].push(story as Story);
    });
    const mapped: Epic[] = (epicsData || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      status: e.status,
      tasks: tasksByEpic[e.id] || []
    }));
    setEpics(mapped);
  };
  useEffect(() => {
    void refreshEpics();
    // Subscribe to realtime changes on epics and stories
    const channel = supabase.channel(`epics:${projectId}`);
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'epics', filter: `project_id=eq.${projectId}` },
        () => {
          void refreshEpics();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories', filter: `project_id=eq.${projectId}` },
        () => {
          void refreshEpics();
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Handle AI generation of epics and tasks
  const handleGenerate = async () => {
    if (!requirements.trim()) {
      toast({ title: 'Error', description: 'Please provide requirements' });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/ai/generate-epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, organisationId, requirements })
      });
      // Read SSE stream and update state incrementally
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (reader) {
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';
          for (const msg of messages) {
            if (!msg.startsWith('data: ')) continue;
            const jsonStr = msg.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.type === 'epic') {
                setEpics((prev) => [...prev, { ...data.epic, tasks: [] }]);
              } else if (data.type === 'story') {
                setEpics((prev) =>
                  prev.map((ep) => (ep.id === data.story.epic_id ? { ...ep, tasks: [...(ep.tasks || []), data.story] } : ep))
                );
              }
              // ignore complete and error here; we refresh at end
            } catch {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast({ title: 'Error', description: 'Failed to generate epics' });
    } finally {
      setLoading(false);
      // Refresh from database to ensure consistency
      void refreshEpics();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">Epics & Tasks</h1>
      <div className="space-y-4">
        <textarea
          className="w-full border p-2 rounded"
          rows={4}
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="Describe your product requirements to generate epics..."
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50" onClick={handleGenerate} disabled={loading || !requirements.trim()}>
          {loading ? 'Generating…' : 'Generate Epics'}
        </button>
      </div>
      <div className="space-y-4">
        {epics.map((epic) => (
          <div key={epic.id} className="border rounded p-4 bg-white dark:bg-zinc-800">
            <h2 className="font-semibold text-lg">{epic.name}</h2>
            {epic.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{epic.description}</p>}
            <div className="mt-2">
              <h3 className="font-medium text-sm">Tasks</h3>
              <ul className="list-disc pl-5 space-y-1">
                {epic.tasks.map((task) => (
                  <li key={task.id} className="text-sm">
                    {task.title}
                    {task.description && <span className="text-xs text-gray-500 dark:text-gray-400"> – {task.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
        {epics.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-300">No epics yet. Generate some using the form above.</p>}
      </div>
    </div>
  );
}



"use client";

// KanbanBoard
//
// This component renders a simple drag‑and‑drop Kanban board backed by Supabase
// and Ably. It subscribes to story updates via Supabase realtime and listens
// for remote drag events via Ably. When a user drags a card between columns
// the change is persisted to Supabase and broadcast to other clients.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { createClient as createSupabaseBrowserClient } from '@/utils/supabase/client';
import { toast } from '@/components/ui/Toasts/use-toast';
import { cn } from '@/utils/cn';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Define the statuses used by SynqForge. Additional statuses can be added here
// and will automatically show up as columns.
const STATUSES: { id: string; name: string }[] = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'in_progress', name: 'In Progress' },
  { id: 'review', name: 'Review' },
  { id: 'done', name: 'Done' }
];

export interface Story {
  id: string;
  title: string;
  description: string | null;
  status: string;
  project_id: string;
  assigned_to?: string | null;
  points?: number | null;
  due_date?: string | null;
  sprint_id?: string | null;
  completed_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface Column {
  id: string;
  name: string;
  stories: Story[];
}

export function KanbanBoard({ projectId }: { projectId: string }) {
  const supabase = createSupabaseBrowserClient();
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [members, setMembers] = useState<Array<{ user_id: string; full_name: string | null; avatar_url: string | null }>>([]);
  const [sprints, setSprints] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Story>>({});
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());
  const [attachmentsByStory, setAttachmentsByStory] = useState<Record<string, Array<{ id: string; file_name: string; file_url: string }>>>({});
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState<string>(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [assigneeFilter, setAssigneeFilter] = useState<string>(searchParams.get('assignee') || '');
  const [sprintFilter, setSprintFilter] = useState<string>(searchParams.get('sprint') || '');
  const [dueStart, setDueStart] = useState<string>(searchParams.get('dueStart') || '');
  const [dueEnd, setDueEnd] = useState<string>(searchParams.get('dueEnd') || '');

  // Initialise Ably realtime channel for this project. We scope the clientId to
  // "kanban" because Ably requires a unique clientId per connection; if
  // multiple hooks call getAblyRealtime with the same id they'll reuse the
  // connection. The useAblyChannel hook returns helpers to publish and
  // subscribe to events on this channel.
  const { publish, subscribe, presence, updatePresence } = useAblyChannel(`project:${projectId}`, 'kanban');

  /**
   * Fetch all stories for the given project and build an array of columns.
   */
  const refreshStories = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('stories').select('*').eq('project_id', projectId).order('created_at', { ascending: true });
    if (statusFilter) query = query.eq('status', statusFilter as 'backlog' | 'in_progress' | 'review' | 'done');
    if (assigneeFilter) query = query.eq('assigned_to', assigneeFilter);
    if (sprintFilter) query = query.eq('sprint_id', sprintFilter);
    if (dueStart) query = query.gte('due_date', dueStart);
    if (dueEnd) query = query.lte('due_date', dueEnd);
    const { data, error } = await query;
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load stories', error);
      toast({ title: 'Error', description: 'Failed to load stories' });
      setLoading(false);
      return;
    }
    const filterText = q.trim().toLowerCase();
    const filtered = (data || []).filter((s) => {
      if (!filterText) return true;
      return (
        (s.title || '').toLowerCase().includes(filterText) ||
        (s.description || '').toLowerCase().includes(filterText)
      );
    });
    const grouped: Column[] = STATUSES.map((status) => ({
      id: status.id,
      name: status.name,
      stories: filtered.filter((s) => s.status === status.id)
    }));
    setColumns(grouped);
    setLoading(false);
  }, [projectId, supabase, statusFilter, assigneeFilter, sprintFilter, dueStart, dueEnd, q]);

  // Fetch project members and active sprints for dropdowns/avatars
  const refreshMeta = useCallback(async () => {
    const { data: membersRows } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId);
    const ids = (membersRows || []).map((r) => r.user_id);
    let mappedMembers: Array<{ user_id: string; full_name: string | null; avatar_url: string | null }> = [];
    if (ids.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .in('id', ids);
      mappedMembers = (usersData || []).map((u) => ({ user_id: u.id, full_name: (u as any).full_name ?? null, avatar_url: (u as any).avatar_url ?? null }));
    }
    setMembers(mappedMembers);
    // include avatar in presence data for current user if available
    try {
      const { data: authData } = await supabase.auth.getUser();
      const meId = authData.user?.id;
      if (meId) {
        const { data: meRow } = await supabase.from('users').select('avatar_url').eq('id', meId).maybeSingle();
        if (meRow?.avatar_url) {
          await updatePresence({ avatar_url: meRow.avatar_url });
        }
      }
    } catch {}
    const { data: sprintData } = await supabase
      .from('sprints')
      .select('id, name, status')
      .eq('project_id', projectId)
      .in('status', ['planning', 'active']);
    setSprints(sprintData || []);
    // Load attachments for visible stories (best-effort; refined after stories loaded)
  }, [projectId, supabase]);

  // Initial fetch and realtime subscription. On mount we fetch all stories
  // immediately. Then we subscribe to the Supabase realtime channel for
  // changes to the stories table. Whenever a change happens the full list
  // is refreshed. This ensures that new cards appear and deleted cards
  // disappear.
  useEffect(() => {
    refreshStories();
    refreshMeta();
    // load watched stories for current user
    (async () => {
      const { data } = await (supabase as any).from('story_watchers').select('story_id');
      setWatchedSet(new Set((data || []).map((r: any) => r.story_id)));
    })();
    const channel = supabase.channel(`stories:${projectId}`);
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories', filter: `project_id=eq.${projectId}` },
        () => {
          void refreshStories();
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [projectId, refreshStories, refreshMeta, supabase]);

  // After columns change, fetch attachments for listed stories
  useEffect(() => {
    (async () => {
      const ids = columns.flatMap((c) => c.stories.map((s) => s.id));
      if (ids.length === 0) return;
      const { data } = await supabase.from('story_attachments').select('id, story_id, file_name, file_url').in('story_id', ids);
      const grouped: Record<string, Array<{ id: string; file_name: string; file_url: string }>> = {};
      (data || []).forEach((row: any) => {
        if (!grouped[row.story_id]) grouped[row.story_id] = [];
        grouped[row.story_id].push({ id: row.id, file_name: row.file_name, file_url: row.file_url });
      });
      setAttachmentsByStory(grouped);
    })();
  }, [columns, supabase]);

  // Persist filters in the URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    function setOrDelete(key: string, value: string) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setOrDelete('q', q);
    setOrDelete('status', statusFilter);
    setOrDelete('assignee', assigneeFilter);
    setOrDelete('sprint', sprintFilter);
    setOrDelete('dueStart', dueStart);
    setOrDelete('dueEnd', dueEnd);
    router.replace(`${pathname}?${params.toString()}`);
  }, [q, statusFilter, assigneeFilter, sprintFilter, dueStart, dueEnd]);

  // Subscribe to remote drag events via Ably. When another user moves a story
  // we update our local state to reflect the new ordering and status. This
  // callback only runs in the browser; the hook returns a cleanup function.
  useEffect(() => {
    const unsubscribe = subscribe('story.moved', (data: any) => {
      const { storyId, from, to, index } = data as {
        storyId: string;
        from: string;
        to: string;
        index: number;
      };
      setColumns((prev) => {
        const copy = prev.map((col) => ({ ...col, stories: [...col.stories] }));
        const source = copy.find((c) => c.id === from);
        const dest = copy.find((c) => c.id === to);
        if (!source || !dest) return prev;
        const srcIndex = source.stories.findIndex((s) => s.id === storyId);
        if (srcIndex < 0) return prev;
        const [moved] = source.stories.splice(srcIndex, 1);
        // update status on the moved card
        moved.status = to;
        dest.stories.splice(index, 0, moved);
        return copy;
      });
      // Notify watchers
      if (watchedSet.has(storyId)) {
        toast({ title: 'Story moved', description: 'A story you watch was moved.' });
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [subscribe, watchedSet]);

  // Subscribe to edits to force refresh
  useEffect(() => {
    const unsub = subscribe('story.edited', () => {
      void refreshStories();
      // We do not have story id here in current payload? The publisher sends { id }
    });
    const unsub2 = subscribe('story.edited', (payload: any) => {
      const id = (payload && (payload as any).id) as string | undefined;
      if (id && watchedSet.has(id)) {
        toast({ title: 'Story updated', description: 'A story you watch was edited.' });
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
      if (typeof unsub2 === 'function') unsub2();
    };
  }, [subscribe, refreshStories, watchedSet]);

  /**
   * Handle a drag end event from the DnD context. If a card was moved
   * between columns we optimistically update local state, persist the
   * change to Supabase and broadcast an event on Ably. If the update
   * fails we reload data.
   */
  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    // nothing changed
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    // optimistic local update
    setColumns((prev) => {
      const copy = prev.map((col) => ({ ...col, stories: [...col.stories] }));
      const fromCol = copy.find((c) => c.id === source.droppableId);
      const toCol = copy.find((c) => c.id === destination.droppableId);
      if (!fromCol || !toCol) return prev;
      const [item] = fromCol.stories.splice(source.index, 1);
      // update status for the moved item
       (item as any).status = destination.droppableId as 'backlog' | 'in_progress' | 'review' | 'done';
      toCol.stories.splice(destination.index, 0, item);
      return copy;
    });
    try {
      // persist to database
      const { error } = await supabase
        .from('stories')
        .update({ status: destination.droppableId as 'backlog' | 'in_progress' | 'review' | 'done' })
        .eq('id', draggableId);
      if (error) throw error;
      // broadcast move event to others
      await publish('story.moved', {
        storyId: draggableId,
        from: source.droppableId,
        to: destination.droppableId,
        index: destination.index
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast({ title: 'Error', description: 'Failed to move story' });
      // reload data from server to revert optimistic changes
      void refreshStories();
    }
  };

  const memberById = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);

  const startEdit = (story: Story) => {
    setEditingId(story.id);
    setForm({
      id: story.id,
      title: story.title,
      description: story.description,
      assigned_to: story.assigned_to ?? null,
      points: story.points ?? 0,
      due_date: story.due_date ?? null,
      sprint_id: story.sprint_id ?? null
    } as any);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const payload: any = {
        title: form.title,
        description: form.description,
        assigned_to: form.assigned_to ?? null,
        points: typeof form.points === 'number' ? form.points : 0,
        due_date: form.due_date ?? null,
        sprint_id: form.sprint_id ?? null,
        status: (form as any).status || undefined,
        priority: (form as any).priority ?? null
      };
      const { error } = await supabase.from('stories').update(payload).eq('id', editingId);
      if (error) throw error;
      toast({ title: 'Saved', description: 'Story updated' });
      setEditingId(null);
      setForm({});
      void refreshStories();
      // Broadcast edit event for other clients to refetch
      await publish('story.edited', { id: editingId });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      toast({ title: 'Error', description: 'Failed to save story' });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({});
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="overflow-x-auto">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex-1 min-w-[12rem]">
          <label className="sr-only" htmlFor="story-search">Search</label>
          <input id="story-search" className="w-full rounded border p-2 text-sm" placeholder="Search stories" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="sr-only" htmlFor="status-filter">Status</label>
          <select id="status-filter" className="rounded border p-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="assignee-filter">Assignee</label>
          <select id="assignee-filter" className="rounded border p-2 text-sm" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">All assignees</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name || m.user_id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="sr-only" htmlFor="sprint-filter">Sprint</label>
          <select id="sprint-filter" className="rounded border p-2 text-sm" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)}>
            <option value="">All sprints</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div>
            <label className="sr-only" htmlFor="due-start">Due start</label>
            <input id="due-start" className="rounded border p-2 text-sm" type="date" value={dueStart} onChange={(e) => setDueStart(e.target.value)} />
          </div>
          <div>
            <label className="sr-only" htmlFor="due-end">Due end</label>
            <input id="due-end" className="rounded border p-2 text-sm" type="date" value={dueEnd} onChange={(e) => setDueEnd(e.target.value)} />
          </div>
          <button className="text-sm px-2 py-1 rounded border" onClick={() => { setQ(''); setStatusFilter(''); setAssigneeFilter(''); setSprintFilter(''); setDueStart(''); setDueEnd(''); }}>Reset</button>
        </div>
      </div>
      {/* Presence avatar stack */}
      <div className="flex -space-x-2 mb-3">
        {presence.slice(0, 6).map((m: any) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.data?.avatar_url || '/favicon.ico'} alt={m.id} className="w-6 h-6 rounded-full border-2 border-white dark:border-zinc-800" />
        ))}
        {presence.length > 6 && (
          <div className="w-6 h-6 rounded-full bg-zinc-300 flex items-center justify-center text-[10px]">+{presence.length - 6}</div>
        )}
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4">
          {columns.map((column) => (
            <Droppable droppableId={column.id} key={column.id}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex-shrink-0 w-64 bg-zinc-100 dark:bg-zinc-900 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">
                      {column.name}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {column.stories.length}
                    </span>
                  </div>
                  {column.stories.map((story, index) => (
                    <Draggable draggableId={story.id} index={index} key={story.id}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className="bg-white dark:bg-zinc-800 rounded p-2 mb-2 shadow"
                        >
                          {editingId === story.id ? (
                            <div className="space-y-2">
                              <input className="w-full rounded border p-1 text-sm" value={form.title as any as string || ''} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                              <textarea className="w-full rounded border p-1 text-xs" rows={3} value={form.description as any as string || ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                              <div className="flex items-center gap-2">
                                <input className="w-20 rounded border p-1 text-sm" type="number" min={0} value={Number(form.points ?? 0)} onChange={(e) => setForm((f) => ({ ...f, points: Number(e.target.value) }))} />
                                <input className="rounded border p-1 text-sm" type="date" value={(form.due_date as any as string) || ''} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                                <label className="sr-only" htmlFor={`file-${story.id}`}>Attachment</label>
                                <input id={`file-${story.id}`} className="hidden" type="file" onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const formData = new FormData();
                                  formData.append('storyId', story.id);
                                  formData.append('file', file);
                                  try {
                                    const res = await fetch('/api/attachments/upload', { method: 'POST', body: formData });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Upload failed');
                                    toast({ title: 'Uploaded', description: 'Attachment uploaded' });
                                  } catch {
                                    toast({ title: 'Error', description: 'Failed to upload attachment' });
                                  }
                                }} />
                                <button className="text-sm px-2 py-1 rounded border" onClick={() => document.getElementById(`file-${story.id}`)?.click()}>Attach</button>
                              </div>
                              <div className="text-[10px] text-zinc-600 space-y-1">
                                {(attachmentsByStory[story.id] || []).map((a) => (
                                  <div key={a.id}>
                                    <a href={a.file_url} className="underline" target="_blank" rel="noreferrer">{a.file_name}</a>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <select className="w-full rounded border p-1 text-sm" value={(form.assigned_to as any as string) || ''} onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value || null }))}>
                                  <option value="">Unassigned</option>
                                  {members.map((m) => (
                                    <option key={m.user_id} value={m.user_id}>{m.full_name || m.user_id}</option>
                                  ))}
                                </select>
                                <select className="w-full rounded border p-1 text-sm" value={(form.sprint_id as any as string) || ''} onChange={(e) => setForm((f) => ({ ...f, sprint_id: e.target.value || null }))}>
                                  <option value="">No sprint</option>
                                  {sprints.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name} [{s.status}]</option>
                                  ))}
                                </select>
                                <select className="w-full rounded border p-1 text-sm" value={(form.status as any as string) || (columns.find(c=>c.stories.some(st=>st.id===editingId))?.id ?? '')} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                                  {STATUSES.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                                <select className="w-full rounded border p-1 text-sm" value={(form as any).priority || ''} onChange={(e) => setForm((f: any) => ({ ...f, priority: e.target.value || null }))}>
                                  <option value="">Priority</option>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                               <div className="flex items-center gap-2 justify-end">
                                <button className="text-sm px-2 py-1 rounded border" onClick={cancelEdit}>Cancel</button>
                                <button className="text-sm px-2 py-1 rounded bg-blue-600 text-white" onClick={saveEdit}>Save</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">{story.title}</div>
                                <div className="text-xs text-zinc-600">{typeof story.points === 'number' ? `${story.points} pts` : ''}</div>
                              </div>
                              {story.description && (
                                <div className="text-xs text-zinc-500 mt-1">{story.description}</div>
                              )}
                               <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center gap-2">
                                  {story.assigned_to && memberById.get(story.assigned_to)?.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={memberById.get(story.assigned_to)!.avatar_url!} alt="avatar" className="w-5 h-5 rounded-full" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-zinc-300" />
                                  )}
                                  <span className="text-xs text-zinc-600">{story.assigned_to ? (memberById.get(story.assigned_to)?.full_name || 'User') : 'Unassigned'}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button className="text-xs text-blue-600" onClick={() => startEdit(story)}>Edit</button>
                                  <WatchToggle
                                    storyId={story.id}
                                    onChange={(isWatching) => {
                                      setWatchedSet((prev) => {
                                        const next = new Set(prev);
                                        if (isWatching) next.add(story.id);
                                        else next.delete(story.id);
                                        return next;
                                      });
                                    }}
                                    onBroadcast={async (isWatching) => {
                                      await publish('story.watched', { storyId: story.id, watching: isWatching });
                                    }}
                                  />
                                   {(story as any).priority && (
                                     <span className="text-[10px] px-1 py-0.5 rounded border">
                                       {(story as any).priority}
                                     </span>
                                   )}
                                </div>
                              </div>
                              {story.due_date && (
                                <div className="text-[10px] text-zinc-500 mt-1">Due: {story.due_date}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

function WatchToggle({ storyId, onChange, onBroadcast }: { storyId: string; onChange?: (watching: boolean) => void; onBroadcast?: (watching: boolean) => Promise<void> | void }) {
  const supabase = createSupabaseBrowserClient();
  const [watching, setWatching] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await (supabase as any)
        .from('story_watchers')
        .select('story_id')
        .eq('story_id', storyId)
        .limit(1);
      if (mounted) setWatching((data || []).length > 0);
    })();
    return () => {
      mounted = false;
    };
  }, [storyId]);

  const toggle = async () => {
    setLoading(true);
    try {
      if (!watching) {
        const { error } = await (supabase as any).from('story_watchers').insert({ story_id: storyId });
        if (error) throw error;
        toast({ title: 'Watching', description: 'You will be notified about changes.' });
        setWatching(true);
        onChange?.(true);
        await onBroadcast?.(true);
      } else {
        const { error } = await (supabase as any).from('story_watchers').delete().eq('story_id', storyId);
        if (error) throw error;
        toast({ title: 'Unwatched', description: 'Stopped notifications for this story.' });
        setWatching(false);
        onChange?.(false);
        await onBroadcast?.(false);
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update watch' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button aria-label={watching ? 'Unwatch story' : 'Watch story'} className={cn('text-xs', watching ? 'text-amber-600' : 'text-zinc-600')} onClick={toggle} disabled={loading}>
      {watching ? 'Watching' : 'Watch'}
    </button>
  );
}
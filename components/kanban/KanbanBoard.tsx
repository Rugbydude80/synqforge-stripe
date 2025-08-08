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

  // Initialise Ably realtime channel for this project. We scope the clientId to
  // "kanban" because Ably requires a unique clientId per connection; if
  // multiple hooks call getAblyRealtime with the same id they'll reuse the
  // connection. The useAblyChannel hook returns helpers to publish and
  // subscribe to events on this channel.
  const { publish, subscribe, presence } = useAblyChannel(`project:${projectId}`, 'kanban');

  /**
   * Fetch all stories for the given project and build an array of columns.
   */
  const refreshStories = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load stories', error);
      toast({ title: 'Error', description: 'Failed to load stories' });
      setLoading(false);
      return;
    }
    const grouped: Column[] = STATUSES.map((status) => ({
      id: status.id,
      name: status.name,
      stories: (data || []).filter((s) => s.status === status.id)
    }));
    setColumns(grouped);
    setLoading(false);
  }, [projectId, supabase]);

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
    const { data: sprintData } = await supabase
      .from('sprints')
      .select('id, name, status')
      .eq('project_id', projectId)
      .in('status', ['planning', 'active']);
    setSprints(sprintData || []);
  }, [projectId, supabase]);

  // Initial fetch and realtime subscription. On mount we fetch all stories
  // immediately. Then we subscribe to the Supabase realtime channel for
  // changes to the stories table. Whenever a change happens the full list
  // is refreshed. This ensures that new cards appear and deleted cards
  // disappear.
  useEffect(() => {
    refreshStories();
    refreshMeta();
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
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [subscribe]);

  // Subscribe to edits to force refresh
  useEffect(() => {
    const unsub = subscribe('story.edited', () => {
      void refreshStories();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [subscribe, refreshStories]);

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
        status: (form as any).status || undefined
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
                                <button className="text-xs text-blue-600" onClick={() => startEdit(story)}>Edit</button>
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
"use client";

// KanbanBoard
//
// This component renders a simple drag‑and‑drop Kanban board backed by Supabase
// and Ably. It subscribes to story updates via Supabase realtime and listens
// for remote drag events via Ably. When a user drags a card between columns
// the change is persisted to Supabase and broadcast to other clients.

import { useCallback, useEffect, useState } from 'react';
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

  // Initialise Ably realtime channel for this project. We scope the clientId to
  // "kanban" because Ably requires a unique clientId per connection; if
  // multiple hooks call getAblyRealtime with the same id they'll reuse the
  // connection. The useAblyChannel hook returns helpers to publish and
  // subscribe to events on this channel.
  const { publish, subscribe } = useAblyChannel(`project:${projectId}`, 'kanban');

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

  // Initial fetch and realtime subscription. On mount we fetch all stories
  // immediately. Then we subscribe to the Supabase realtime channel for
  // changes to the stories table. Whenever a change happens the full list
  // is refreshed. This ensures that new cards appear and deleted cards
  // disappear.
  useEffect(() => {
    refreshStories();
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
  }, [projectId, refreshStories, supabase]);

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

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="overflow-x-auto">
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
                          <div className="text-sm font-medium">
                            {story.title}
                          </div>
                          {story.description && (
                            <div className="text-xs text-zinc-500 mt-1">
                              {story.description}
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
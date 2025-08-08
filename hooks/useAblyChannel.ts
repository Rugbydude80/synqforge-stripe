import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannelPromise } from 'ably';
import { getAblyRealtime } from '@/lib/ably';

type AnyData = Record<string, any>;

export function useAblyChannel(channelName: string, clientId: string) {
  const [presence, setPresence] = useState<AnyData[]>([]);
  const clientRef = useRef<any>(null);
  const channelRef = useRef<RealtimeChannelPromise | null>(null);

  const channel = useMemo(() => channelRef.current, [channelRef.current]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!channelName || !clientId) return;
      const client = await getAblyRealtime(clientId);
      if (!client || !mounted) return;
      clientRef.current = client;
      const ch = client.channels.get(channelName);
      channelRef.current = ch;

      await ch.attach();

      // presence
      const updateMembers = async () => {
        const members = await ch.presence.get();
        if (mounted) setPresence(members.map((m: any) => m.clientId ? { id: m.clientId, data: m.data } : m));
      };
      await updateMembers();

      await ch.presence.enter({ ts: Date.now() });
      ch.presence.subscribe(async () => {
        await updateMembers();
      });

      // connection recovery
      client.connection.on((stateChange: any) => {
        if (stateChange.current === 'connected') {
          // Refresh presence after reconnect
          void updateMembers();
        }
      });
    })();

    return () => {
      mounted = false;
      if (channelRef.current) {
        try {
          channelRef.current.presence.leave();
          channelRef.current.detach();
        } catch {}
      }
    };
  }, [channelName, clientId]);

  const publish = useCallback(async (event: string, data: AnyData) => {
    if (!channelRef.current) return;
    await channelRef.current.publish(event, data);
  }, []);

  const subscribe = useCallback(
    (event: string, callback: (data: AnyData) => void) => {
      if (!channelRef.current) return () => {};
      const handler = (msg: any) => callback(msg.data);
      channelRef.current.subscribe(event, handler);
      return () => channelRef.current?.unsubscribe(event, handler);
    },
    []
  );

  // convenience helpers
  const sendCursorMove = useCallback(
    async (payload: { x: number; y: number }) => publish('cursor.move', payload),
    [publish]
  );
  const sendStoryMoved = useCallback(
    async (payload: { storyId: string; from: string; to: string; index: number }) =>
      publish('story.moved', payload),
    [publish]
  );

  return {
    channel,
    presence,
    publish,
    subscribe,
    sendCursorMove,
    sendStoryMoved
  } as const;
}



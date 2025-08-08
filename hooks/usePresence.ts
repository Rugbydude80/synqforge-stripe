import { useEffect, useState } from 'react';

export type PresenceMember = {
  id: string;
  metadata?: Record<string, unknown>;
};

export type PresenceAdapter = {
  join: (member: PresenceMember) => void | Promise<void>;
  leave: (memberId: string) => void | Promise<void>;
  subscribe: (
    callback: (members: PresenceMember[]) => void
  ) => void | (() => void);
  update?: (member: PresenceMember) => void | Promise<void>;
};

export function usePresence(
  adapter: PresenceAdapter | undefined,
  self: PresenceMember
) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    if (!adapter) return;

    const maybeUnsub = adapter.subscribe((list) => setMembers(list));
    void adapter.join(self);

    return () => {
      void adapter.leave(self.id);
      if (typeof maybeUnsub === 'function') maybeUnsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, self.id]);

  const updateSelf = async (metadata: Record<string, unknown>) => {
    if (adapter?.update) {
      await adapter.update({ ...self, metadata });
    }
  };

  return { members, updateSelf } as const;
}



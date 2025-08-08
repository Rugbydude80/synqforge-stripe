import { useEffect, useState } from 'react';

export type SyncAdapter<T> = {
  subscribe: (callback: (value: T) => void) => void | (() => void);
  publish: (value: T) => void | Promise<void>;
};

export function useRealtimeSync<T>(adapter: SyncAdapter<T>, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const maybeUnsub = adapter.subscribe((v) => setValue(v));
    return () => {
      if (typeof maybeUnsub === 'function') maybeUnsub();
    };
  }, [adapter]);

  const setAndPublish = async (next: T) => {
    setValue(next);
    await adapter.publish(next);
  };

  return [value, setAndPublish] as const;
}



'use client';
import { useRef, useState } from 'react';

/** Ref locks close the gap before React commits the disabled state. */
export function usePendingActions() {
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  async function runAction(key: string, action: () => void | Promise<void>) {
    if (locks.current.has(key)) return;
    locks.current.add(key);
    setPending(new Set(locks.current));
    try {
      await action();
    } finally {
      locks.current.delete(key);
      setPending(new Set(locks.current));
    }
  }
  return { pending, runAction, isPending: (key: string) => pending.has(key) };
}

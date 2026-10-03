'use client';

import { useEffect, useState } from 'react';

export interface AlertMessage { type: 'success' | 'error'; text: string }

export function AutoDismissAlert({ message, onDismiss, className = '' }: { message: AlertMessage; onDismiss: () => void; className?: string }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (message.type !== 'success') return;
    const fade = window.setTimeout(() => setLeaving(true), 2700);
    const close = window.setTimeout(onDismiss, 3000);
    return () => { window.clearTimeout(fade); window.clearTimeout(close); };
  }, [message.type, message.text, onDismiss]);
  return <div role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex items-center justify-between rounded-xl border p-4 text-xs font-semibold transition-all duration-300 ${leaving ? 'translate-y-1 opacity-0' : 'opacity-100'} ${message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'} ${className}`}>
    <span>{message.text}</span><button type="button" aria-label="بستن اعلان" onClick={onDismiss} className="rounded p-1 text-sm font-bold opacity-60 hover:opacity-100 focus-visible:outline-2">✕</button>
  </div>;
}

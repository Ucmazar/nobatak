'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { DashboardAccessReport } from '@/lib/dashboard-access';
import { supabase } from '@/lib/supabase/client';
import { createLiveRefresh } from '@/lib/live-refresh';
import { AdminLogoutButton } from './AdminLogoutButton';

export function DashboardAccessGuard({ children, initialReport }: { children: ReactNode; initialReport: DashboardAccessReport }) {
  const [access, setAccess] = useState(initialReport.access);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch('/api/dashboard-access', { cache: 'no-store', signal: controller.signal });
        const result: DashboardAccessReport = await response.json();
        if (disposed) return;
        const state = response.ok ? result.access : 'unavailable';
        setAccess(state);
        if (state === 'allowed') window.dispatchEvent(new CustomEvent('nobatak-access-updated', { detail: result }));
        if (state === 'login') window.location.replace('/login');
        if (state === 'admin') window.location.replace('/admin');
        if (state === 'disabled' || state === 'business_disabled') window.location.replace('/account-disabled');
      } catch { if (!disposed) setAccess('unavailable'); }
    }
    const sync = createLiveRefresh(check, () => document.visibilityState !== 'hidden' && navigator.onLine);
    const account = initialReport.accountId;
    const channel = account ? supabase.channel('dashboard-access:' + account)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses', filter: 'owner_id=eq.' + account }, sync.request)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + account }, sync.request)
      .subscribe(sync.connection) : null;
    if (initialReport.access !== 'allowed') sync.request();
    window.addEventListener('focus', sync.request);
    window.addEventListener('online', sync.request);
    document.addEventListener('visibilitychange', sync.request);
    return () => {
      disposed = true;
      controller.abort();
      sync.close();
      window.removeEventListener('focus', sync.request);
      window.removeEventListener('online', sync.request);
      document.removeEventListener('visibilitychange', sync.request);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [initialReport.accountId, initialReport.access]);
  if (access !== 'allowed') return <main dir="rtl" className="min-h-screen grid place-content-center gap-4 text-center p-6">
    <p role="alert">{access === 'unavailable' ? 'بررسی دسترسی ممکن نشد. تا برقراری اتصال، داشبورد بسته است.' : 'در حال بررسی دسترسی…'}</p>
    {access === 'unavailable' && <AdminLogoutButton />}
  </main>;
  return children;
}

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AdminLogoutButton } from './AdminLogoutButton';

export function DashboardAccessGuard({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState('checking');
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    async function check() {
      if (pending || disposed) return;
      pending = true;
      try {
        const response = await fetch('/api/dashboard-access', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (disposed) return;
        const state = response.ok ? result.access : 'unavailable';
        setAccess(state);
        if (state === 'allowed') window.dispatchEvent(new CustomEvent('nobatak-access-updated', { detail: result }));
        if (state === 'login') window.location.replace('/login');
        if (state === 'admin') window.location.replace('/admin');
        if ((state === 'disabled' || state === 'business_disabled')) window.location.replace('/account-disabled');
      } catch { if (!disposed) setAccess('unavailable'); }
      finally { pending = false; }
    }
    void check();
    // Realtime is best-effort; polling also works without publication configuration.
    const channel = supabase.channel('dashboard-access')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => { void check(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => { void check(); })
      .subscribe();
    const timer = window.setInterval(() => { void check(); }, 3000);
    const refresh = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      void supabase.removeChannel(channel);
    };
  }, []);
  if (access !== 'allowed') return <main dir="rtl" className="min-h-screen grid place-content-center gap-4 text-center p-6">
    <p role="alert">{access === 'unavailable' ? 'بررسی دسترسی ممکن نشد. تا برقراری اتصال، داشبورد بسته است.' : 'در حال بررسی دسترسی…'}</p>
    <AdminLogoutButton />
  </main>;
  return children;
}

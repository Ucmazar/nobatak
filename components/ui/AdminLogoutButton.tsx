'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function AdminLogoutButton({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      document.cookie = 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
      window.location.replace('/login');
    } catch {
      setError('خروج انجام نشد؛ دوباره تلاش کنید.');
      setLoading(false);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className={variant === 'light'
          ? 'text-sm font-medium text-slate-600 bg-white hover:bg-slate-50 px-5 py-3 rounded-xl border border-slate-200 transition disabled:opacity-50 disabled:cursor-wait focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600'
          : 'text-xs bg-red-950/40 hover:bg-red-900/60 text-red-200 px-3 py-2 rounded-lg border border-red-800 transition disabled:opacity-50 disabled:cursor-wait'}
      >
        {loading ? 'در حال خروج…' : 'خروج از حساب'}
      </button>
      {error && <p role="alert" className="absolute left-0 top-full mt-2 w-56 rounded-lg bg-red-950 border border-red-800 p-3 text-xs text-red-200">{error}</p>}
    </div>
  );
}
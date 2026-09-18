'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function GoogleSignInContent({ disabled = false }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const reason = searchParams.get('error');
  const callbackError = reason ? (reason === 'account_disabled'
    ? 'حساب شما غیرفعال است. با مدیر سیستم تماس بگیرید.'
    : 'ورود تکمیل نشد. لطفاً دوباره تلاش کنید.') : null;
  const displayedError = error ?? callbackError;

  async function signIn() {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
          skipBrowserRedirect: true,
        },
      });
      if (authError || !data.url) throw authError ?? new Error('Missing redirect');
      window.location.assign(data.url);
    } catch {
      setError('اتصال به گوگل انجام نشد. دوباره تلاش کنید یا با ایمیل وارد شوید.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={signIn} disabled={disabled || loading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-wait">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55z" />
          <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {loading ? 'در حال انتقال به گوگل…' : 'ادامه با گوگل'}
      </button>
      {displayedError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{displayedError}</p>}
      <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />یا با ایمیل و رمز عبور<span className="h-px flex-1 bg-slate-200" /></div>
    </div>
  );
}
export function GoogleSignInButton({ disabled = false }: { disabled?: boolean }) {
  return <Suspense fallback={<div className="h-24" />}><GoogleSignInContent disabled={disabled} /></Suspense>;
}
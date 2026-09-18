import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/database';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  function failure(reason = 'oauth_failed') {
    const response = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
    response.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 });
    return response;
  }

  if (!code || searchParams.has('error')) return failure();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session || !data.user) return failure();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', data.user.id)
      .returns<Pick<Profile, 'role' | 'is_active'>[]>()
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut({ scope: 'local' });
      return failure();
    }
    if (profile.is_active === false) {
      await supabase.auth.signOut({ scope: 'local' });
      return failure('account_disabled');
    }

    const destination = profile.role === 'superadmin' ? '/admin' : '/dashboard';
    const response = NextResponse.redirect(new URL(destination, origin));
    // Compatibility with the project's existing middleware and logout handlers.
    response.cookies.set('sb-access-token', data.session.access_token, {
      path: '/', maxAge: data.session.expires_in, sameSite: 'lax',
      secure: new URL(origin).protocol === 'https:',
    });
    return response;
  } catch {
    return failure();
  }
}
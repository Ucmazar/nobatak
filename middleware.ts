import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values: { name: string; value: string; options: CookieOptions }[]) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } },
  );
  const { data: { user } } = await client.auth.getUser();
  const pathname = request.nextUrl.pathname;
  let target: string | null = null;
  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin'))) target = '/login';
  if (user && (pathname === '/login' || pathname === '/register')) target = '/dashboard';
  if (target) {
    const redirected = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach(cookie => redirected.cookies.set(cookie));
    return redirected;
  }
  return response;
}
export const config = { matcher: ['/admin/:path*', '/dashboard/:path*', '/login', '/register', '/api/dashboard-access', '/account-disabled'] };

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'placeholder-key';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}

export async function createSupabaseServerClient() {
  return createClient();
}


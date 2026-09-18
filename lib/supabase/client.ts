import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  'placeholder-key';

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

export function createSupabaseClient() {
  return createClient();
}

// Singleton for client components
export const supabase = createSupabaseClient();


import { supabase } from '@/lib/supabase/client';
import { Profile } from '@/types/database';

export async function getUserProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export async function upsertUserProfile(profile: Partial<Profile> & { id: string }): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('Error upserting profile:', error);
      return null;
    }
    return data;
  } catch (e) {
    console.error('Error upserting profile:', e);
    return null;
  }
}

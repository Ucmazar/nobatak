import { supabase } from '@/lib/supabase/client';
import { Staff } from '@/types/database';

export async function getBusinessStaff(
  businessId: string,
  activeOnly = false
): Promise<Staff[]> {
  try {
    let query = supabase
      .from('staff')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('Error fetching staff members:', err);
    return [];
  }
}

export async function createStaff(
  staffData: Omit<Staff, 'id' | 'created_at' | 'updated_at'>
): Promise<{ staff: Staff | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('staff')
      .insert(staffData)
      .select()
      .single();

    if (error) return { staff: null, error: error.message };
    return { staff: data, error: null };
  } catch (err: any) {
    return { staff: null, error: err.message || 'خطا در افزودن کارمند' };
  }
}

export async function updateStaff(
  id: string,
  staffData: Partial<Staff>
): Promise<{ staff: Staff | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('staff')
      .update(staffData)
      .eq('id', id)
      .select()
      .single();

    if (error) return { staff: null, error: error.message };
    return { staff: data, error: null };
  } catch (err: any) {
    return { staff: null, error: err.message || 'خطا در ویرایش کارمند' };
  }
}

export async function deleteStaff(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

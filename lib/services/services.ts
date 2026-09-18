import { supabase } from '@/lib/supabase/client';
import { Service } from '@/types/database';

export async function getBusinessServices(
  businessId: string,
  activeOnly = false
): Promise<Service[]> {
  try {
    let query = supabase
      .from('services')
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
    console.error('Error fetching services:', err);
    return [];
  }
}

export async function createService(
  serviceData: Omit<Service, 'id' | 'created_at' | 'updated_at'>
): Promise<{ service: Service | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('services')
      .insert(serviceData)
      .select()
      .single();

    if (error) return { service: null, error: error.message };
    return { service: data, error: null };
  } catch (err: any) {
    return { service: null, error: err.message || 'خطا در ثبت خدمت' };
  }
}

export async function updateService(
  id: string,
  serviceData: Partial<Omit<Service, 'id' | 'business_id'>>
): Promise<{ service: Service | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('services')
      .update(serviceData)
      .eq('id', id)
      .select()
      .single();

    if (error) return { service: null, error: error.message };
    return { service: data, error: null };
  } catch (err: any) {
    return { service: null, error: err.message || 'خطا در ویرایش خدمت' };
  }
}

export async function deleteService(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

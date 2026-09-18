import { supabase } from '@/lib/supabase/client';
import { Business } from '@/types/database';
import { isValidUUID } from '@/lib/utils';

export async function getUserBusinesses(ownerId: string): Promise<Business[]> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('Error fetching user businesses:', err);
    return [];
  }
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  try {
    let decodedSlug = slug;
    try {
      decodedSlug = decodeURIComponent(slug);
    } catch {
      decodedSlug = slug;
    }
    const trimmedSlug = decodedSlug.trim();

    console.log('[getBusinessBySlug] Searching for slug:', JSON.stringify(trimmedSlug));

    const { data: slugData } = await supabase
      .from('businesses')
      .select('*')
      .ilike('slug', trimmedSlug)
      .maybeSingle();

    if (slugData && slugData.is_active !== false) {
      console.log('[getBusinessBySlug] Found by slug:', slugData.name);
      return slugData;
    }

    if (isValidUUID(trimmedSlug)) {
      const { data: idData } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', trimmedSlug)
        .maybeSingle();
      if (idData && idData.is_active !== false) {
        console.log('[getBusinessBySlug] Found by id:', idData.name);
        return idData;
      }
    }

    console.log('[getBusinessBySlug] No business found for slug:', JSON.stringify(trimmedSlug));
    return null;
  } catch (err) {
    console.error('Error fetching business by slug:', err);
    return null;
  }
}

export async function createBusiness(
  bizData: Omit<Business, 'id' | 'created_at' | 'updated_at'>
): Promise<{ business: Business | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .insert(bizData)
      .select()
      .single();

    if (error) {
      if (error.message.includes('BUSINESS_LIMIT_REACHED')) return { business: null, error: 'به سقف مجاز تعداد کسب‌وکار رسیده‌اید. برای افزایش سقف با مدیر سیستم تماس بگیرید.' };
      if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('slug')) {
        const uniqueSlug = `${bizData.slug}-${Math.floor(1000 + Math.random() * 9000)}`;
        const { data: retryData, error: retryError } = await supabase
          .from('businesses')
          .insert({ ...bizData, slug: uniqueSlug })
          .select()
          .single();

        if (!retryError && retryData) {
          return { business: retryData, error: null };
        }
        return { business: null, error: 'این آدرس اختصاصی (slug) قبلاً استفاده شده است. لطفاً آدرس دیگری وارد کنید.' };
      }
      return { business: null, error: error.message };
    }
    return { business: data, error: null };
  } catch (err: any) {
    return { business: null, error: err.message || 'خطا در برقراری ارتباط با دیتابیس' };
  }
}

export async function updateBusiness(
  id: string,
  bizData: Partial<Business>
): Promise<{ business: Business | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .update(bizData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.message.includes('max_daily_appointments') || error.message.includes('schema cache')) {
        const payload = { ...bizData };
        delete payload.max_daily_appointments;
        const { data: retryData, error: retryError } = await supabase
          .from('businesses')
          .update(payload)
          .eq('id', id)
          .select()
          .single();

        if (!retryError && retryData) {
          return { business: retryData, error: null };
        }
        return { business: null, error: retryError?.message || error.message };
      }
      return { business: null, error: error.message };
    }
    return { business: data, error: null };
  } catch (err: any) {
    return { business: null, error: err.message || 'خطا در به روزرسانی کسب‌وکار' };
  }
}

export async function deleteBusiness(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('businesses')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

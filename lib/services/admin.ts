/**
 * سرویس مدیریت — فقط برای Super Admin (fahimadmin)
 * Admin Service — Only for superadmin role
 *
 * این توابع از طریق Supabase client اجرا می‌شوند.
 * دسترسی واقعی توسط RLS در Supabase کنترل می‌شود.
 */

import { supabase } from '@/lib/supabase/client';
import { Profile, Business } from '@/types/database';

// ─── آمار کلی سیستم ──────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  totalBusinesses: number;
  activeBusinesses: number;
  inactiveBusinesses: number;
  totalAppointments: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  try {
    const [
      { count: totalUsers },
      { count: totalBusinesses },
      { count: activeBusinesses },
      { count: inactiveBusinesses },
      { count: totalAppointments },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('businesses').select('*', { count: 'exact', head: true }),
      supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', false),
      supabase.from('appointments').select('*', { count: 'exact', head: true }),
    ]);

    return {
      totalUsers: totalUsers ?? 0,
      totalBusinesses: totalBusinesses ?? 0,
      activeBusinesses: activeBusinesses ?? 0,
      inactiveBusinesses: inactiveBusinesses ?? 0,
      totalAppointments: totalAppointments ?? 0,
    };
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    return {
      totalUsers: 0,
      totalBusinesses: 0,
      activeBusinesses: 0,
      inactiveBusinesses: 0,
      totalAppointments: 0,
    };
  }
}

// ─── لیست کاربران ─────────────────────────────────────────────────────────────

export async function getAllUsers(): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('Error fetching all users:', err);
    return [];
  }
}

// ─── لیست کسب‌وکارها ──────────────────────────────────────────────────────────

export interface BusinessWithOwner extends Business {
  owner?: Pick<Profile, 'full_name' | 'phone'> | null;
}

export async function getAllBusinesses(): Promise<BusinessWithOwner[]> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error('Error fetching all businesses:', err);
    return [];
  }
}

// ─── فعال / غیرفعال کردن کاربر ──────────────────────────────────────────────

export async function toggleUserActive(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId)
      .select('id, is_active')
      .returns<Pick<Profile, 'id' | 'is_active'>[]>()
      .single();

    if (error) return { success: false, error: error.message };
    if (!data || data.is_active !== isActive) return { success: false, error: 'تغییر وضعیت کاربر در دیتابیس ثبت نشد. دسترسی مدیر را بررسی کنید.' };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'خطای ناشناخته' };
  }
}

// ─── فعال / غیرفعال کردن کسب‌وکار ───────────────────────────────────────────

export async function toggleBusinessActive(
  businessId: string,
  isActive: boolean
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('businesses')
      .update({ is_active: isActive })
      .eq('id', businessId)
      .select('id, is_active')
      .returns<Pick<Business, 'id' | 'is_active'>[]>()
      .single();

    if (error) return { success: false, error: error.message };
    if (!data || data.is_active !== isActive) return { success: false, error: 'تغییر وضعیت در دیتابیس تأیید نشد.' };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'خطای ناشناخته' };
  }
}

// ─── بررسی اینکه کاربر جاری superadmin است یا نه ────────────────────────────

export async function checkIsSuperAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || !data) return false;
    return data.role === 'superadmin';
  } catch {
    return false;
  }
}

export type AdminBusinessItem = BusinessWithOwner;
export type AdminUserItem = Profile;

export async function setUserBusinessLimit(userId: string, limit: number | null): Promise<{ success: boolean; error: string | null }> {
  if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0 || limit > 2147483647)) {
    return { success: false, error: 'سقف باید عدد صحیح صفر یا بیشتر باشد.' };
  }
  try {
    const { data, error } = await supabase.from('profiles')
      .update({ max_businesses: limit }).eq('id', userId)
      .select('id, max_businesses').returns<Pick<Profile, 'id' | 'max_businesses'>[]>().single();
    if (error) return { success: false, error: error.message.includes('max_businesses') ? 'ابتدا اسکریپت جدید دسترسی و سقف کسب‌وکار را در Supabase اجرا کنید.' : error.message };
    if (!data || data.max_businesses !== limit) return { success: false, error: 'ذخیره سقف در دیتابیس تأیید نشد.' };
    return { success: true, error: null };
  } catch { return { success: false, error: 'ذخیره سقف انجام نشد. اتصال را بررسی کنید.' }; }
}

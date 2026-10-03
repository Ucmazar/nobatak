import { supabase } from '@/lib/supabase/client';
import type { WorkShift } from '@/types/database';
import type { WorkShiftPlanLimits } from '@/lib/work-shifts';

const messageFor = (message: string) => message.includes('WORK_SHIFTS_DISABLED')
  ? 'شیفت کاری در پلن فعلی فعال نیست.'
  : message.includes('WORK_SHIFT_LIMIT_REACHED')
    ? 'سقف تعداد شیفت‌های پلن تکمیل شده است.'
    : message.includes('INVALID_WORK_SHIFT') || message.includes('23514')
      ? 'نام و ساعت‌های شیفت معتبر نیست.'
      : message;

export async function getBusinessWorkShifts(businessId: string, activeOnly = false): Promise<WorkShift[]> {
  let query = supabase.from('work_shifts').select('*,staff(count)').eq('business_id', businessId).order('created_at');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => {
    const value = row as unknown as WorkShift & { staff?: Array<{ count: number }> };
    return { ...value, staff_count: value.staff?.[0]?.count ?? 0, staff: undefined } as WorkShift;
  });
}

export async function getWorkShiftPlanLimits(businessId: string): Promise<WorkShiftPlanLimits> {
  const { data, error } = await supabase.rpc('business_work_shift_limits', { p_business: businessId });
  if (error || !data?.[0]) return { enabled: false, maxShifts: 0 };
  return { enabled: data[0].enabled, maxShifts: data[0].max_shifts };
}

export async function createWorkShift(input: Omit<WorkShift, 'id' | 'created_at' | 'updated_at' | 'staff_count'>) {
  const { data, error } = await supabase.from('work_shifts').insert(input).select().single();
  return { shift: error ? null : data, error: error ? messageFor(error.message) : null };
}

export async function updateWorkShift(id: string, input: Partial<Pick<WorkShift, 'name' | 'start_time' | 'end_time' | 'is_active'>>) {
  const { data, error } = await supabase.from('work_shifts').update(input).eq('id', id).select().single();
  return { shift: error ? null : data, error: error ? messageFor(error.message) : null };
}

export async function deleteWorkShift(id: string) {
  const { error } = await supabase.from('work_shifts').delete().eq('id', id);
  return { success: !error, error: error ? messageFor(error.message) : null };
}

import type { Business, Profile, Staff, WorkShift } from '@/types/database';

export type WorkShiftPlanLimits = { enabled: boolean; maxShifts: number | null };
export type EffectiveWorkingHours = {
  source: 'business' | 'shift';
  name: string;
  startTime: string | null;
  endTime: string | null;
};

const timePart = (value?: string | null) => value?.slice(0, 5) || null;

export function getPlanLimits(profile?: Pick<Profile, 'plan_code' | 'plan_expires_on' | 'work_shifts_enabled' | 'max_work_shifts'> | null, today?: string): WorkShiftPlanLimits {
  const expired = Boolean(profile?.plan_code !== 'free' && profile?.plan_expires_on && today && profile.plan_expires_on < today);
  if (!profile || profile.plan_code === 'free' || expired) return { enabled: false, maxShifts: 0 };
  if (profile.plan_code === 'growth') return { enabled: true, maxShifts: 2 };
  if (profile.plan_code === 'custom') return { enabled: profile.work_shifts_enabled === true, maxShifts: profile.work_shifts_enabled === true ? profile.max_work_shifts ?? null : 0 };
  return { enabled: true, maxShifts: null };
}

export function getEmployeeEffectiveWorkingHours(staff: Pick<Staff, 'shift_id'> & { shift?: WorkShift | null }, business: Pick<Business, 'opening_time' | 'closing_time'>, limits: WorkShiftPlanLimits): EffectiveWorkingHours {
  const shift = limits.enabled && staff.shift_id && staff.shift?.is_active ? staff.shift : null;
  return shift
    ? { source: 'shift', name: shift.name, startTime: timePart(shift.start_time), endTime: timePart(shift.end_time) }
    : { source: 'business', name: 'ساعت عمومی کسب‌وکار', startTime: timePart(business.opening_time), endTime: timePart(business.closing_time) };
}

export function formatWorkingHours(hours: EffectiveWorkingHours): string {
  if (!hours.startTime || !hours.endTime) return `${hours.name} — تنظیم نشده`;
  return `${hours.name} — ${hours.startTime} تا ${hours.endTime}${hours.endTime < hours.startTime ? ' (روز بعد)' : ''}`;
}

export function isTimeWithinWorkingHours(value: string, hours: Pick<EffectiveWorkingHours, 'startTime' | 'endTime'>): boolean {
  const time = timePart(value);
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  if (!hours.startTime || !hours.endTime) return true;
  if (hours.startTime === hours.endTime) return false;
  return hours.startTime < hours.endTime
    ? time >= hours.startTime && time < hours.endTime
    : time >= hours.startTime || time < hours.endTime;
}

export function workShiftValidation(name: string, startTime: string, endTime: string): string | null {
  if (!name.trim()) return 'نام شیفت الزامی است.';
  if (name.trim().length > 80) return 'نام شیفت نباید بیشتر از ۸۰ نویسه باشد.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return 'ساعت شروع و پایان معتبر نیست.';
  if (startTime === endTime) return 'ساعت شروع و پایان شیفت نباید یکسان باشد.';
  return null;
}

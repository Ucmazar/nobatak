import { supabase } from '@/lib/supabase/client';
import type { SubscriptionStatus } from '@/types/database';

export interface EffectivePlanLimits {
  planCode: string; status: SubscriptionStatus; startedAt: string | null; expiresAt: string | null; remainingDays: number | null;
  maxBusinesses: number | null; maxServices: number; maxStaff: number; maxDailyAppointments: number;
  advancedScheduling: boolean; workShiftsEnabled: boolean; maxWorkShifts: number;
}
const map = (row: { plan_code: string; effective_status: SubscriptionStatus; started_at: string | null; expires_at: string | null; remaining_days: number | null; max_businesses: number | null; max_services: number; max_staff: number; max_daily_appointments: number; advanced_scheduling: boolean; work_shifts_enabled: boolean; max_work_shifts: number }): EffectivePlanLimits => ({
  planCode: row.plan_code, status: row.effective_status, startedAt: row.started_at, expiresAt: row.expires_at, remainingDays: row.remaining_days,
  maxBusinesses: row.max_businesses, maxServices: row.max_services, maxStaff: row.max_staff, maxDailyAppointments: row.max_daily_appointments,
  advancedScheduling: row.advanced_scheduling, workShiftsEnabled: row.work_shifts_enabled, maxWorkShifts: row.max_work_shifts,
});
export async function getOwnerPlanLimits(ownerId: string) { const { data, error } = await supabase.rpc('owner_effective_plan_limits', { p_owner: ownerId }); return { limits: data?.[0] ? map(data[0]) : null, error: error?.message ?? null }; }
export async function getBusinessEffectivePlan(businessId: string) { const { data, error } = await supabase.rpc('business_effective_plan_limits', { p_business: businessId }); return { limits: data?.[0] ? map(data[0]) : null, error: error?.message ?? null }; }
export async function canCreateBusiness(ownerId: string) { const { data, error } = await supabase.rpc('can_create_business', { p_owner: ownerId }); return { allowed: data === true, error: error?.message ?? null }; }

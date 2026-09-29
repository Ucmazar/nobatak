import { supabase } from '@/lib/supabase/client';
import { Appointment, AppointmentStatus } from '@/types/database';
import { getKabulTodayISO } from '@/lib/afghaniMonths';
import { isValidUUID } from '@/lib/utils';

const pendingReads = new Map<string, Promise<Appointment[]>>();
// No settled queue cache. Concurrent callers share only an in-flight database read.
export function getBusinessAppointments(businessId: string, date?: string, throwOnError = false): Promise<Appointment[]> {
  const key = JSON.stringify([businessId, date, throwOnError]);
  const existing = pendingReads.get(key);
  if (existing) return existing;
  const request = fetchBusinessAppointments(businessId, date, throwOnError).finally(() => {
    if (pendingReads.get(key) === request) pendingReads.delete(key);
  });
  pendingReads.set(key, request);
  return request;
}
export function invalidateAppointmentReads() { pendingReads.clear(); }

async function fetchBusinessAppointments(businessId: string, date?: string, throwOnError = false): Promise<Appointment[]> {
  try {
    let query = supabase.from('appointments')
      .select('*, service:services(*), staff:staff(*)')
      .eq('business_id', businessId);
    if (date) query = query.eq('appointment_date', date);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as Appointment[];
  } catch (err) {
    if (throwOnError) {
      const issue = err as { code?: string; message?: string };
      const missingDate = ['42703', 'PGRST204'].includes(issue.code ?? '') && issue.message?.includes('appointment_date');
      throw new Error(missingDate ? 'تنظیم تاریخ نوبت‌ها هنوز تکمیل نشده است. لطفاً با پشتیبانی تماس بگیرید.' : 'دریافت نوبت‌ها ممکن نشد. اتصال اینترنت را بررسی کرده و دوباره تلاش کنید.');
    }
    console.error('Error fetching appointments:', err);
    return [];
  }
}

export async function createAppointment(
  appointmentData: {
    business_id: string;
    service_id?: string | null;
    staff_id?: string | null;
    customer_name: string;
    booking_device_id?: string | null;
    customer_phone?: string | null;
    queue_number: number;
    status?: AppointmentStatus;
    estimated_wait_minutes?: number;
    appointment_date?: string;
  }
): Promise<{ appointment: Appointment | null; error: string | null }> {
  try {
    invalidateAppointmentReads();
    const targetDate = appointmentData.appointment_date || getKabulTodayISO();

    const payload: any = {
      business_id: appointmentData.business_id,
      customer_name: appointmentData.customer_name,
      booking_device_id: appointmentData.booking_device_id || null,
      customer_phone: appointmentData.customer_phone || null,
      queue_number: appointmentData.queue_number,
      status: appointmentData.status || 'waiting',
      estimated_wait_minutes: appointmentData.estimated_wait_minutes || 0,
      appointment_date: targetDate,
    };

    if (appointmentData.service_id && isValidUUID(appointmentData.service_id)) {
      payload.service_id = appointmentData.service_id;
    }
    if (appointmentData.staff_id && isValidUUID(appointmentData.staff_id)) {
      payload.staff_id = appointmentData.staff_id;
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert(payload)
      .select('*, service:services(*), staff:staff(*)')
      .single();

    if (error) {
      if (error.message.includes('BOOKING_CLOSED')) return { appointment: null, error: 'BOOKING_CLOSED' };
      if (error.message.includes('BUSINESS_DAILY_CAPACITY_REACHED')) return { appointment: null, error: 'ظرفیت روزانهٔ پلن کسب‌وکار تکمیل شده است؛ روز دیگری انتخاب کنید.' };
      if (error.message.includes('DAILY_CAPACITY_REACHED')) return { appointment: null, error: 'DAILY_CAPACITY_REACHED' };
      if (error.message.includes('DEVICE_ACTIVE_LIMIT_REACHED')) return { appointment: null, error: 'DEVICE_ACTIVE_LIMIT_REACHED' };
      if (error.message.includes('DUPLICATE_ACTIVE_NAME')) return { appointment: null, error: 'DUPLICATE_ACTIVE_NAME' };
      return { appointment: null, error: error.message };
    }
    return { appointment: data as unknown as Appointment, error: null };
  } catch (err: any) {
    return { appointment: null, error: err.message || 'خطا در ثبت نوبت در دیتابیس' };
  }
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus, expected?: { queueNumber: number; lateCount: number }): Promise<{ success: boolean; error: string | null; warning?: string }> {
  try {
    invalidateAppointmentReads();
    const response = await fetch('/api/appointments/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, expectedQueueNumber: expected?.queueNumber, expectedLateCount: expected?.lateCount }) });
    const result = await response.json();
    invalidateAppointmentReads();
    if (!response.ok) return { success: false, error: result.error || 'ذخیرهٔ وضعیت نوبت انجام نشد.' };
    return result;
  } catch { return { success: false, error: 'ارتباط با سرور برقرار نشد.' }; }
}

export async function deleteAppointment(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    invalidateAppointmentReads();
    const { data, error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id).select('id');
    invalidateAppointmentReads();
    if (!error && !data?.length) return { success: false, error: 'این نوبت حذف نشد یا دیگر در دسترس نیست.' };

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

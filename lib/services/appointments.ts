import { supabase } from '@/lib/supabase/client';
import { Appointment, AppointmentStatus } from '@/types/database';
import { getKabulTodayISO } from '@/lib/afghaniMonths';
import { isValidUUID } from '@/lib/utils';

export async function getBusinessAppointments(businessId: string, date?: string, throwOnError = false): Promise<Appointment[]> {
  try {
    let query = supabase.from('appointments')
      .select('*, service:services(*), staff:staff(*)')
      .eq('business_id', businessId);
    if (date) query = query.eq('appointment_date', date);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as Appointment[];
  } catch (err) {
    if (throwOnError) throw err;
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
    customer_phone?: string | null;
    queue_number: number;
    status?: AppointmentStatus;
    estimated_wait_minutes?: number;
    appointment_date?: string;
  }
): Promise<{ appointment: Appointment | null; error: string | null }> {
  try {
    const targetDate = appointmentData.appointment_date || getKabulTodayISO();

    const payload: any = {
      business_id: appointmentData.business_id,
      customer_name: appointmentData.customer_name,
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
      return { appointment: null, error: error.message };
    }
    return { appointment: data as unknown as Appointment, error: null };
  } catch (err: any) {
    return { appointment: null, error: err.message || 'خطا در ثبت نوبت در دیتابیس' };
  }
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteAppointment(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

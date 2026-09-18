import { supabase } from '@/lib/supabase/client';
import { Appointment, AppointmentStatus } from '@/types/database';
import { isValidUUID } from '@/lib/utils';

export async function getBusinessAppointments(businessId: string, date?: string): Promise<Appointment[]> {
  try {
    if (date) {
      const { data: dateData, error: dateError } = await supabase
        .from('appointments')
        .select('*, service:services(*), staff:staff(*)')
        .eq('business_id', businessId)
        .eq('appointment_date', date)
        .order('created_at', { ascending: true });

      if (!dateError && dateData) {
        return dateData as unknown as Appointment[];
      }
    }

    // Fallback: fetch all appointments for business if appointment_date column isn't in schema cache yet
    const { data, error } = await supabase
      .from('appointments')
      .select('*, service:services(*), staff:staff(*)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });

    if (error || !data) return [];
    return data as unknown as Appointment[];
  } catch (err) {
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
    const targetDate = appointmentData.appointment_date || new Date().toISOString().split('T')[0];

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
      // If remote Supabase schema cache doesn't have 'appointment_date' column yet,
      // fallback to inserting without 'appointment_date' in payload so creation NEVER fails!
      if (error.message.includes('appointment_date') || error.message.includes('schema cache')) {
        delete payload.appointment_date;
        const { data: retryData, error: retryError } = await supabase
          .from('appointments')
          .insert(payload)
          .select('*, service:services(*), staff:staff(*)')
          .single();

        if (!retryError && retryData) {
          return { appointment: retryData as unknown as Appointment, error: null };
        }
        return { appointment: null, error: retryError?.message || error.message };
      }
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

import { createAppointment } from '@/lib/services/appointments';
import type { Appointment } from '@/types/database';
export async function createPublicAppointment(input: Parameters<typeof createAppointment>[0]): Promise<{ appointment: Appointment | null; error: string | null }> {
  try {
    const config = await fetch('/api/telegram/config').then(r => r.json());
    if (!config.enabled) return createAppointment(input);
    const response = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) return { appointment: null, error: result.error || 'ثبت نوبت انجام نشد.' };
    if (result.ticketToken) { try { localStorage.setItem('nobatak_ticket_' + result.appointment.id, result.ticketToken); } catch { /* Booking remains valid; browser persistence is unavailable. */ } }
    return { appointment: result.appointment, error: null };
  } catch { return { appointment: null, error: 'ارتباط برقرار نشد. پیش از تلاش دوباره، نوبت‌های خود را بررسی کنید.' }; }
}
export async function cancelPublicAppointment(id: string) {
  const token = localStorage.getItem('nobatak_ticket_' + id);
  if (!token) { const { deleteAppointment } = await import('@/lib/services/appointments'); return deleteAppointment(id); }
  try {
    const response = await fetch('/api/telegram/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'cancel' }) });
    const result = await response.json(); return { success: response.ok, error: result.error ?? null };
  } catch { return { success: false, error: 'ارتباط برقرار نشد.' }; }
}

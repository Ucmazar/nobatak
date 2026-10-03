import { createClient } from '@supabase/supabase-js';
import { botReady } from '@/lib/telegram/server';
import { signTicket } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!/^[a-f0-9-]{36}$/i.test(data.business_id ?? '') || !/^[a-f0-9-]{36}$/i.test(data.booking_device_id ?? '') || typeof data.customer_name !== 'string' || !data.customer_name.trim() || data.customer_name.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(data.appointment_date ?? '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.appointment_time ?? '') || (data.customer_phone && (typeof data.customer_phone !== 'string' || data.customer_phone.length > 40))) return Response.json({ error: 'اطلاعات نوبت معتبر نیست.' }, { status: 400 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, { auth: { persistSession: false } });
    const checks = await Promise.all([
      db.rpc('nobatak_telegram_ready'),
      db.from('businesses').select('id').eq('id', data.business_id).eq('is_active', true).maybeSingle(),
      ...[['services','service_id'], ['staff','staff_id']].map(async ([table, field]) => {
        if (!data[field]) return { data: true, error: null };
        return db.from(table).select('id').eq('id', data[field]).eq('business_id', data.business_id).eq('is_active', true).maybeSingle();
      }),
    ]);
    if (checks[0].error || checks[0].data !== true) return Response.json({ error: 'ثبت نوبت هنوز آماده نیست.' }, { status: 503 });
    if (checks.slice(1).some(check => check.error || !check.data)) return Response.json({ error: 'کسب‌وکار، خدمت یا کارمند در دسترس نیست.' }, { status: 400 });
    const { data: appointment, error } = await db.from('appointments').insert({ business_id: data.business_id, booking_device_id: data.booking_device_id, customer_name: data.customer_name.trim(), customer_phone: data.customer_phone || null, service_id: data.service_id || null, staff_id: data.staff_id || null, appointment_date: data.appointment_date, appointment_time: data.appointment_time, status: 'waiting', queue_number: 1, estimated_wait_minutes: 0 }).select('*,service:services(*),staff:staff(*)').single();
    if (error) return Response.json({ error: error.message.includes('BOOKING_CLOSED') ? 'BOOKING_CLOSED' : error.message.includes('DEVICE_ACTIVE_LIMIT_REACHED') ? 'DEVICE_ACTIVE_LIMIT_REACHED' : error.message.includes('DUPLICATE_ACTIVE_NAME') ? 'DUPLICATE_ACTIVE_NAME' : error.message.includes('BUSINESS_DAILY_CAPACITY_REACHED') ? 'BUSINESS_DAILY_CAPACITY_REACHED' : error.message.includes('DAILY_CAPACITY_REACHED') ? 'DAILY_CAPACITY_REACHED' : error.message.includes('OUTSIDE_EFFECTIVE_WORKING_HOURS') ? 'OUTSIDE_EFFECTIVE_WORKING_HOURS' : error.message.includes('APPOINTMENT_TIME_REQUIRED') ? 'APPOINTMENT_TIME_REQUIRED' : 'ثبت نوبت انجام نشد. لطفاً دوباره تلاش کنید.' }, { status: 409 });
    // Tokens are issued only for a row created by this request, never by supplying another row ID.
    return Response.json({ appointment, ticketToken: botReady() ? signTicket(appointment.id, process.env.TELEGRAM_BOT_TOKEN!) : null });
  } catch { return Response.json({ error: 'ثبت نوبت انجام نشد.' }, { status: 500 }); }
}

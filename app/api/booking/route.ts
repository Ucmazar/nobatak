import { createClient } from '@supabase/supabase-js';
import { botReady } from '@/lib/telegram/server';
import { signTicket } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const data = await request.json();
    if (!/^[a-f0-9-]{36}$/i.test(data.business_id ?? '') || typeof data.customer_name !== 'string' || !data.customer_name.trim() || data.customer_name.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(data.appointment_date ?? '') || (data.customer_phone && (typeof data.customer_phone !== 'string' || data.customer_phone.length > 40))) return Response.json({ error: 'اطلاعات نوبت معتبر نیست.' }, { status: 400 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!, { auth: { persistSession: false } });
    const { data: ready, error: readyError } = await db.rpc('nobatak_telegram_ready');
    if (readyError || ready !== true) return Response.json({ error: 'ثبت نوبت هنوز آماده نیست.' }, { status: 503 });
    const { data: business, error: businessError } = await db.from('businesses').select('id').eq('id', data.business_id).eq('is_active', true).maybeSingle();
    if (businessError || !business) return Response.json({ error: 'کسب‌وکار در دسترس نیست.' }, { status: 400 });
    for (const [table, field] of [['services','service_id'], ['staff','staff_id']]) {
      if (data[field]) { const { data: match } = await db.from(table).select('id').eq('id', data[field]).eq('business_id', data.business_id).eq('is_active', true).maybeSingle(); if (!match) return Response.json({ error: 'خدمت یا کارمند معتبر نیست.' }, { status: 400 }); }
    }
    const { data: appointment, error } = await db.from('appointments').insert({ business_id: data.business_id, customer_name: data.customer_name.trim(), customer_phone: data.customer_phone || null, service_id: data.service_id || null, staff_id: data.staff_id || null, appointment_date: data.appointment_date, status: 'waiting', queue_number: 1, estimated_wait_minutes: 0 }).select('*,service:services(*),staff:staff(*)').single();
    if (error) return Response.json({ error: error.message.includes('DAILY_CAPACITY_REACHED') ? 'DAILY_CAPACITY_REACHED' : 'ثبت نوبت انجام نشد. لطفاً دوباره تلاش کنید.' }, { status: 409 });
    // Tokens are issued only for a row created by this request, never by supplying another row ID.
    return Response.json({ appointment, ticketToken: botReady() ? signTicket(appointment.id, process.env.TELEGRAM_BOT_TOKEN!) : null });
  } catch { return Response.json({ error: 'ثبت نوبت انجام نشد.' }, { status: 500 }); }
}

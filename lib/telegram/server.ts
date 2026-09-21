import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { signTicket } from './tickets';
import { getKabulTodayISO, isoToAfghaniDate } from '@/lib/afghaniMonths';

export function botReady() { return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.TELEGRAM_WEBHOOK_SECRET); }
export function database() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Bot configuration missing');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function publicOrigin(fallback: string) {
  const candidate = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : fallback);
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.)/.test(parsed.hostname)) throw new Error('Public HTTPS origin required');
  return parsed.origin;
}
export const keyboard = { keyboard: [[{ text: 'وضعیت نوبت من' }], [{ text: 'مدیریت نوبت‌ها' }, { text: 'قطع اعلان‌ها' }], [{ text: 'دربارهٔ نوبتک' }, { text: 'راهنمای استفاده' }]], resize_keyboard: true, is_persistent: true };
export async function send(chat: string, text: string, markup: object = keyboard) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, reply_markup: markup }), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram delivery failed');
}
export async function ticketStatus(id: string) {
  const db = database();
  const { data: appointment, error } = await db.from('appointments').select('id,business_id,staff_id,customer_name,queue_number,status,appointment_date').eq('id', id).maybeSingle();
  if (error) throw new Error('Ticket query failed');
  if (!appointment) return null;
  const { data: business, error: bizError } = await db.from('businesses').select('name,slug,is_active').eq('id', appointment.business_id).single();
  if (bizError) throw new Error('Business query failed');
  if (business.is_active === false) return null;
  const queueQuery = db.from('appointments').select('id', { count: 'exact', head: true }).eq('business_id', appointment.business_id).eq('appointment_date', appointment.appointment_date).in('status', ['waiting', 'serving']).lt('queue_number', appointment.queue_number);
  const { count, error: countError } = await (appointment.staff_id ? queueQuery.eq('staff_id', appointment.staff_id) : queueQuery.is('staff_id', null));
  if (countError) throw new Error('Queue query failed');
  const ahead = count ?? 0;
  let staffName = 'بدون انتخاب کارمند';
  if (appointment.staff_id) {
    const { data: staff, error: staffError } = await db.from('staff').select('name').eq('id', appointment.staff_id).maybeSingle();
    if (staffError) throw new Error('Staff query failed');
    staffName = staff?.name || 'کارمند پیشین';
  }
  const weekday = new Intl.DateTimeFormat('fa-AF', { weekday: 'long', timeZone: 'Asia/Kabul' }).format(new Date(appointment.appointment_date + 'T12:00:00Z'));
  const labels: Record<string, string> = { waiting: `${ahead.toLocaleString('fa-AF')} نفر قبل از شما هستند.`, serving: 'اکنون نوبت شماست؛ لطفاً به مسئول مراجعه کنید.', completed: 'نوبت شما انجام شده است.', cancelled: 'نوبت شما لغو شده است.' };
  return { appointment, business, ahead, text: `${business.name}\nنام مشتری: ${appointment.customer_name}\nنوبت شما: ${appointment.queue_number.toLocaleString('fa-AF')}\n${weekday}، ${isoToAfghaniDate(appointment.appointment_date)}\nکارمند / استاد: ${staffName}\n${labels[appointment.status] ?? 'وضعیت نوبت تغییر کرده است.'}`, fingerprint: `${appointment.appointment_date}:${appointment.status}:${appointment.status === 'completed' ? 0 : ahead}`, near: appointment.appointment_date === getKabulTodayISO() && (appointment.status === 'serving' || (appointment.status === 'waiting' && ahead <= 3)) };
}
export async function management(chat: string, origin: string) {
  const { data, error } = await database().from('telegram_subscriptions').select('appointment_id,appointments!inner(status)').eq('chat_id', chat).in('appointments.status', ['waiting', 'serving']).order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error('Subscription query failed');
  if (!data?.length) { await send(chat, 'نوبت فعالی به این حساب وصل نیست. برای اتصال نوبت، دکمهٔ تلگرام روی رسید سایت را بزنید.'); return; }
  for (const item of data) {
    const status = await ticketStatus(item.appointment_id); if (!status || !['waiting', 'serving'].includes(status.appointment.status)) continue;
    const url = `${origin}/q/${encodeURIComponent(status.business.slug)}#ticket=${signTicket(item.appointment_id, process.env.TELEGRAM_BOT_TOKEN!)}`;
    await send(chat, status.text, { inline_keyboard: [[{ text: 'مدیریت این نوبت در سایت', url }]] });
  }
}

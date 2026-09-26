import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getKabulTodayISO } from '@/lib/afghaniMonths';
import { dispatchDailyNotices } from '@/lib/telegram/daily-notices';

export const runtime = 'nodejs';
export const maxDuration = 60;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

export async function GET(request: Request) {
  const businessId = new URL(request.url).searchParams.get('businessId') || '';
  if (!uuid.test(businessId)) return json({ error: 'شناسه معتبر نیست.' }, 400);
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: 'ورود لازم است.' }, 401);
    const { data: notices, error } = await client.rpc('daily_notice_summary', { p_business: businessId });
    if (error) return json({ error: error.code === '42501' ? 'دسترسی مجاز نیست.' : 'تنظیم توقف روزانه هنوز در دیتابیس نصب نشده یا در دسترس نیست.' }, error.code === '42501' ? 403 : 503);
    const date = getKabulTodayISO();
    const { data: day, error: dayError } = await client.from('business_day_closures').select('is_closed,reason,booking_date').eq('business_id', businessId).eq('booking_date', date).maybeSingle();
    if (dayError) return json({ error: 'دریافت وضعیت امروز انجام نشد.' }, 503);
    return json({ day: day || { is_closed: false, reason: '', booking_date: date }, notices });
  } catch { return json({ error: 'ارتباط برقرار نشد.' }, 503); }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'درخواست مجاز نیست.' }, 403);
  try {
    const body = await request.json();
    if (!uuid.test(body.businessId || '')) return json({ error: 'کسب‌وکار معتبر نیست.' }, 400);
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: 'ورود لازم است.' }, 401);
    if (body.action === 'retry') {
      const { error } = await client.rpc('daily_notice_summary', { p_business: body.businessId });
      if (error) return json({ error: 'دسترسی یا تنظیمات ارسال در دسترس نیست.' }, 403);
      after(() => dispatchDailyNotices(body.businessId).catch(() => { console.error('Cancellation outbox unavailable'); }));
      return json({ success: true });
    }
    if (typeof body.closed !== 'boolean' || typeof body.cancelToday !== 'boolean' || !uuid.test(body.requestId || '') || typeof body.reason !== 'string' || body.reason.length > 500 || ((body.closed || body.cancelToday) && body.reason.trim().length < 3)) {
      return json({ error: 'برای توقف یا لغو نوبت‌های امروز، دلیل حداقل سه حرفی وارد کنید.' }, 400);
    }
    const { data, error } = await client.rpc('set_business_day_booking', {
      p_business: body.businessId, p_closed: body.closed, p_reason: body.reason.trim(),
      p_cancel_today: body.cancelToday, p_request: body.requestId,
    });
    if (error) return json({ error: error.code === '42501' ? 'دسترسی مجاز نیست.' : 'تغییر انجام نشد؛ تنظیمات دیتابیس و دلیل واردشده را بررسی کنید.' }, error.code === '42501' ? 403 : 409);
    after(() => dispatchDailyNotices(body.businessId).catch(() => { console.error('Cancellation outbox dispatch failed; notices remain pending'); }));
    return json({ success: true, result: data });
  } catch { return json({ error: 'پاسخ دریافت نشد؛ وضعیت را بررسی و در صورت نیاز دوباره تلاش کنید.' }, 503); }
}

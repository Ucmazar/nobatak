import { createClient } from '@/lib/supabase/server';
import { getDashboardAccess } from '@/lib/dashboard-access';
import { botReady, database, publicOrigin } from '@/lib/telegram/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function authorized() {
  return await getDashboardAccess(await createClient()) === 'admin';
}
async function telegram(method: string, body: object = {}) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram unavailable');
  return result.result;
}
async function inspect(request: Request, register: boolean) {
  if (!await authorized()) return json({ message: 'ورود با حساب سوپرادمین فعال لازم است.' }, 403);
  const missing = ['TELEGRAM_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_WEBHOOK_SECRET'].filter(key => !process.env[key]);
  if (!botReady()) return json({ message: 'این تنظیمات در سرور مقدار ندارند: ' + missing.join(', ') }, 409);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(process.env.TELEGRAM_WEBHOOK_SECRET!)) return json({ message: 'رمز وب‌هوک باید ۳۲ تا ۲۵۶ حرف انگلیسی، عدد، خط تیره یا زیرخط باشد.' }, 409);
  const { data, error } = await database().rpc('nobatak_telegram_ready');
  if (error || data !== true) return json({ message: 'اتصال دیتابیس یا نصب تنظیمات تلگرام کامل نیست.' }, 409);
  const origin = publicOrigin(request.url);
  const webhook = new URL('/api/telegram/webhook', origin).href;
  const me = await telegram('getMe');
  if (me.username?.toLowerCase() !== 'nobatech_bot') return json({ message: 'توکن ذخیره‌شده متعلق به ربات نوبتک نیست.' }, 409);
  if (register) await telegram('setWebhook', { url: webhook, secret_token: process.env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] });
  const info = await telegram('getWebhookInfo');
  const connected = info.url === webhook;
  return json({ connected, pending: info.pending_update_count ?? 0, previousError: Boolean(info.last_error_date), notificationConfigured: Boolean(process.env.TELEGRAM_NOTIFICATION_SECRET),
    message: connected ? 'آدرس دریافت پیام ربات ثبت شده است. اکنون در تلگرام Start را بزنید تا پاسخ واقعی آزمایش شود.' : 'آدرس دریافت پیام ربات به این سایت متصل نیست؛ دکمهٔ اتصال را بزنید.' });
}
export async function GET(request: Request) {
  try { return await inspect(request, false); } catch { return json({ message: 'بررسی اتصال انجام نشد؛ توکن ربات، آدرس آنلاین سایت و دسترسی سرور به تلگرام را بررسی کنید.' }, 503); }
}
export async function POST(request: Request) {
  // Cookie-authenticated mutation: reject cross-origin requests before touching Telegram.
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({ message: 'درخواست نامعتبر است.' }, 403);
  try { return await inspect(request, true); } catch { return json({ message: 'اتصال ثبت نشد؛ توکن ربات و دسترسی سرور به تلگرام را بررسی کنید.' }, 503); }
}

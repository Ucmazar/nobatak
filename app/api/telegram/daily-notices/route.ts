import { timingSafeEqual } from 'node:crypto';
import { dispatchDailyNotices } from '@/lib/telegram/daily-notices';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Optional external scheduler: POST with the existing notification secret.
// No customer data is exposed. Never accept a browser-supplied Supabase service key.
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_NOTIFICATION_SECRET;
  const supplied = request.headers.get('x-nobatak-notify-secret');
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return Response.json({ success: false }, { status: 403 });
  try { await dispatchDailyNotices(null); return Response.json({ success: true }); }
  catch { return Response.json({ success: false }, { status: 503 }); }
}

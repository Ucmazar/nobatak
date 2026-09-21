import { randomUUID } from 'node:crypto';
import { botReady, database } from '@/lib/telegram/server';
import { verifyTicket } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!botReady()) return Response.json({ error: 'تلگرام فعال نیست.' }, { status: 503 });
  try {
    const { tokens } = await request.json();
    if (!Array.isArray(tokens) || !tokens.length || tokens.length > 100 || tokens.some(t => typeof t !== 'string' || t.length > 64)) return Response.json({ error: 'فهرست رسیدها معتبر نیست.' }, { status: 400 });
    const ids = tokens.map(t => verifyTicket(t, process.env.TELEGRAM_BOT_TOKEN!));
    if (ids.some(id => !id)) return Response.json({ error: 'یکی از رسیدها معتبر نیست؛ صفحه را تازه کنید.' }, { status: 400 });
    const db = database();
    const { data, error } = await db.from('appointments').select('id').in('id', [...new Set(ids as string[])]).in('status', ['waiting','serving']);
    if (error) throw new Error('Query failed');
    if (!data?.length) return Response.json({ error: 'نوبت فعالی برای اتصال وجود ندارد.' }, { status: 409 });
    const id = randomUUID();
    const { error: insertError } = await db.from('telegram_ticket_bundles').insert({ id, appointment_ids: data.map(row => row.id), expires_at: new Date(Date.now()+86400000).toISOString() });
    if (insertError) return Response.json({ error: 'تنظیم اتصال چند نوبت در دیتابیس هنوز کامل نشده است.' }, { status: 503 });
    return Response.json({ link: 'https://t.me/nobatech_bot?start=b_' + id, count: data.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'ساخت لینک تلگرام انجام نشد.' }, { status: 503 }); }
}

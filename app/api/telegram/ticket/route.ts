import { botReady, database } from '@/lib/telegram/server';
import { verifyTicket } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (!botReady()) return Response.json({ error: 'اتصال هنوز فعال نیست.' }, { status: 503 });
    const { token, action } = await request.json();
    const id = typeof token === 'string' ? verifyTicket(token, process.env.TELEGRAM_BOT_TOKEN!) : null;
    if (!id) return Response.json({ error: 'لینک نوبت معتبر نیست.' }, { status: 403 });
    const db = database();
    if (action === 'cancel') {
      const { data, error } = await db.from('appointments').delete().eq('id', id).eq('status', 'waiting').select('id');
      if (error || !data?.length) return Response.json({ error: 'این نوبت قابل لغو نیست.' }, { status: 409 });
      return Response.json({ success: true });
    }
    const { data: appointment, error } = await db.from('appointments').select('*,service:services(*),staff:staff(*)').eq('id', id).maybeSingle();
    if (error || !appointment) return Response.json({ error: 'نوبت پیدا نشد.' }, { status: 404 });
    return Response.json({ appointment });
  } catch { return Response.json({ error: 'دریافت نوبت ممکن نشد.' }, { status: 500 }); }
}

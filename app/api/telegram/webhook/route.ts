import { botReady, database, management, publicOrigin, send, ticketStatus } from '@/lib/telegram/server';
import { secretMatches, verifyTicket } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!botReady()) return new Response('Unavailable', { status: 503 });
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });
  try {
    const update = await request.json(); const message = update.message;
    if (!message || message.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || typeof message.text !== 'string') return Response.json({ ok: true });
    const chat = String(message.chat.id); const text = message.text.trim(); const db = database();
    if (text.startsWith('/start ')) {
      const id = verifyTicket(text.slice(7), process.env.TELEGRAM_BOT_TOKEN!);
      if (!id) { await send(chat, 'لینک نوبت معتبر نیست. از دکمهٔ داخل رسید نوبت استفاده کنید.'); return Response.json({ ok: true }); }
      const status = await ticketStatus(id);
      if (!status || !['waiting','serving'].includes(status.appointment.status)) { await send(chat, 'این نوبت دیگر فعال نیست.'); return Response.json({ ok: true }); }
      const { data, error } = await db.rpc('bind_telegram_ticket', { p_appointment: id, p_chat: chat });
      if (error) throw new Error('Link failed');
      if (!data) { await send(chat, 'این نوبت قبلاً به حساب دیگری وصل شده است.'); return Response.json({ ok: true }); }
      await send(chat, 'اعلان‌های این نوبت فعال شد. وقتی سه نفر یا کمتر تا نوبت شما باقی بماند، خبر می‌دهیم.\n\n' + status.text);
    } else if (text === 'قطع اعلان‌ها' || text === '/stop') {
      const { error } = await db.from('telegram_subscriptions').update({ enabled: false }).eq('chat_id', chat);
      if (error) throw new Error('Stop failed');
      await send(chat, 'اعلان‌ها قطع شدند؛ نوبت‌های شما لغو نشده‌اند. برای فعال‌سازی دوباره، دکمهٔ تلگرام روی رسید را بزنید.');
    } else if (text === 'مدیریت نوبت‌ها') {
      await management(chat, publicOrigin(request.url));
    } else {
      const { data, error } = await db.from('telegram_subscriptions').select('appointment_id,appointments!inner(status)').eq('chat_id', chat).in('appointments.status', ['waiting', 'serving']).order('created_at', { ascending: false }).limit(10);
      if (error) throw new Error('Read failed');
      if (!data?.length) await send(chat, 'نوبت فعالی به این حساب وصل نیست. نوبت‌های انجام‌شده و لغوشده نمایش داده نمی‌شوند.');
      else for (const row of data) { const status = await ticketStatus(row.appointment_id); if (status && ['waiting', 'serving'].includes(status.appointment.status)) await send(chat, status.text); }
    }
    return Response.json({ ok: true });
  } catch { return new Response('Temporary failure', { status: 503 }); }
}

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
    if (text.startsWith('/start b_')) {
      const bundleId = text.slice(9);
      if (!/^[a-f0-9-]{36}$/i.test(bundleId)) { await send(chat, 'لینک اتصال معتبر نیست.'); return Response.json({ ok: true }); }
      const now = new Date().toISOString();
      const { error: claimError } = await db.from('telegram_ticket_bundles').update({ chat_id: chat }).eq('id', bundleId).is('chat_id', null).gt('expires_at', now);
      if (claimError) throw new Error('Bundle claim failed');
      const { data: bundle, error: bundleError } = await db.from('telegram_ticket_bundles').select('appointment_ids').eq('id', bundleId).eq('chat_id', chat).gt('expires_at', now).maybeSingle();
      if (bundleError) throw new Error('Bundle query failed');
      if (!bundle) { await send(chat, 'این لینک منقضی شده یا به حساب دیگری وصل است؛ دوباره دکمهٔ تلگرام روی رسید سایت را بزنید.'); return Response.json({ ok: true }); }
      let linked = 0;
      for (const id of bundle.appointment_ids) {
        const status = await ticketStatus(id);
        if (!status || !['waiting','serving'].includes(status.appointment.status)) continue;
        const { data: bound, error } = await db.rpc('bind_telegram_ticket', { p_appointment: id, p_chat: chat });
        if (error) throw new Error('Ticket bind failed');
        if (!bound) continue;
        await send(chat, status.text); linked++;
      }
      await send(chat, linked ? linked.toLocaleString('fa-AF') + ' نوبت فعال به این حساب وصل شد.' : 'نوبت قابل اتصالی در این لینک باقی نمانده است.');
      return Response.json({ ok: true });
    }
    if (text === 'دربارهٔ نوبتک' || text === '/about') {
      await send(chat, 'دربارهٔ نوبتک\n\nنوبتک توسط جناب فهیم‌الله برای سهولت مشتریان عزیز و مدیریت منظم نوبت‌های کسب‌وکارها ساخته شده است. با نوبتک می‌توانید نوبت بگیرید، کارمند یا داکتر مورد نظر خود را انتخاب کنید و وضعیت صف را پیگیری کنید. هدف ما کاهش انتظار و آسان‌ترشدن هماهنگی میان مشتریان و ارائه‌دهندگان خدمات است.');
    } else if (text === 'راهنمای استفاده' || text === '/help') {
      await send(chat, 'راهنمای استفاده از ربات نوبتک\n\n۱. از لینک یا کیوآرکد کسب‌وکار وارد سایت شوید و روز، خدمت و کارمند را انتخاب کنید؛ سپس نوبت بگیرید.\n۲. روی رسید، «اطلاع‌رسانی با تلگرام» را بزنید و در ربات Start را انتخاب کنید تا همان نوبت وصل شود.\n۳. با «وضعیت نوبت من»، نوبت‌های فعال و تعداد افراد جلوتر را ببینید.\n۴. با «مدیریت نوبت‌ها»، رسید را در سایت باز کنید و در صورت نیاز نوبت را لغو کنید.\n۵. برای نوبت امروز، با پیش‌رفتن صف و نزدیک‌شدن یا شروع نوبت، اعلان دریافت می‌کنید.\n۶. «قطع اعلان‌ها» فقط پیام‌های خودکار را متوقف می‌کند و نوبت را لغو نمی‌کند. برای فعال‌سازی دوباره، از دکمهٔ تلگرام روی رسید استفاده کنید.');
    } else if (text === '/start') {
      await send(chat, 'به نوبتک خوش آمدید!\nبرای اتصال نوبت، دکمهٔ «اطلاع‌رسانی با تلگرام» روی رسید سایت را بزنید.\nاز دکمه‌های زیر می‌توانید دربارهٔ نوبتک بخوانید، راهنما را ببینید و نوبت‌های فعال خود را پیگیری کنید.');
    } else if (text.startsWith('/start ')) {
      const id = verifyTicket(text.slice(7), process.env.TELEGRAM_BOT_TOKEN!);
      if (!id) { await send(chat, 'لینک نوبت معتبر نیست. از دکمهٔ داخل رسید نوبت استفاده کنید.'); return Response.json({ ok: true }); }
      const status = await ticketStatus(id);
      if (!status || !['waiting','serving'].includes(status.appointment.status)) { await send(chat, 'این نوبت دیگر فعال نیست.'); return Response.json({ ok: true }); }
      const { data, error } = await db.rpc('bind_telegram_ticket', { p_appointment: id, p_chat: chat });
      if (error) throw new Error('Link failed');
      if (!data) { await send(chat, 'این نوبت قبلاً به حساب دیگری وصل شده است.'); return Response.json({ ok: true }); }
      await send(chat, 'اعلان‌های این نوبت فعال شد.' + (status.appointment.status === 'waiting' && status.ahead > 3 ? ' با جلو رفتن صف، جایگاه جدیدتان را خبر می‌دهیم.' : '') + '\n\n' + status.text);
    } else if (text === 'قطع اعلان‌ها' || text === '/stop') {
      const { error } = await db.from('telegram_subscriptions').update({ enabled: false }).eq('chat_id', chat);
      if (error) throw new Error('Stop failed');
      await send(chat, 'اعلان‌ها قطع شدند؛ نوبت‌های شما لغو نشده‌اند. برای فعال‌سازی دوباره، دکمهٔ تلگرام روی رسید را بزنید.');
    } else if (text === 'مدیریت نوبت‌ها') {
      await management(chat, publicOrigin(request.url));
    } else {
      const { data, error } = await db.from('telegram_subscriptions').select('appointment_id,appointments!inner(status)').eq('chat_id', chat).in('appointments.status', ['waiting', 'serving']).order('created_at', { ascending: false });
      if (error) throw new Error('Read failed');
      if (!data?.length) await send(chat, 'نوبت فعالی به این حساب وصل نیست. نوبت‌های انجام‌شده و لغوشده نمایش داده نمی‌شوند.');
      else for (const row of data) { const status = await ticketStatus(row.appointment_id); if (status && ['waiting', 'serving'].includes(status.appointment.status)) await send(chat, status.text); }
    }
    return Response.json({ ok: true });
  } catch { return new Response('Temporary failure', { status: 503 }); }
}

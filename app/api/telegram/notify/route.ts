import { botReady } from '@/lib/telegram/server';
import { notifyBusinesses } from '@/lib/telegram/notifications';
import { secretMatches } from '@/lib/telegram/tickets';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!botReady() || !secretMatches(request.headers.get('x-nobatak-notify-secret'), process.env.TELEGRAM_NOTIFICATION_SECRET)) return new Response('Forbidden', { status: 403 });
  try {
    const event = await request.json();
    if (event.schema !== 'public' || event.table !== 'appointments' || !['INSERT','UPDATE','DELETE'].includes(event.type)) return new Response('Invalid event', { status: 400 });
    const ids = [...new Set([event.record?.business_id, event.old_record?.business_id].filter((id): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)))];
    if (!ids.length) return Response.json({ ok: true });
    await notifyBusinesses(ids);
    return Response.json({ ok: true });
  } catch { return new Response('Temporary failure', { status: 503 }); }
}

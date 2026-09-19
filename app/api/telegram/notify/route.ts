import { botReady, database, send, ticketStatus } from '@/lib/telegram/server';
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
    const db = database();
    const { data, error } = await db.from('telegram_subscriptions').select('appointment_id,chat_id').in('business_id', ids).eq('enabled', true);
    if (error) throw new Error('Subscriptions failed');
    // No send occurs until the customer has explicitly started the bot for this ticket.
    for (const row of data ?? []) {
      const status = await ticketStatus(row.appointment_id); if (!status?.near) continue;
      const { data: claimed, error: claimError } = await db.rpc('claim_telegram_notice', { p_appointment: row.appointment_id, p_fingerprint: status.fingerprint });
      if (claimError) throw new Error('Lease failed');
      if (!claimed) continue;
      try {
        await send(row.chat_id, 'یادآوری نوبت شما\n' + status.text);
        const { error: doneError } = await db.from('telegram_subscriptions').update({ last_fingerprint: status.fingerprint, pending_fingerprint: null, lease_until: null }).eq('appointment_id', row.appointment_id).eq('pending_fingerprint', status.fingerprint);
        if (doneError) throw new Error('Notice update failed');
      } catch {
        await db.from('telegram_subscriptions').update({ pending_fingerprint: null, lease_until: null }).eq('appointment_id', row.appointment_id).eq('pending_fingerprint', status.fingerprint);
        throw new Error('Delivery failed');
      }
    }
    return Response.json({ ok: true });
  } catch { return new Response('Temporary failure', { status: 503 }); }
}

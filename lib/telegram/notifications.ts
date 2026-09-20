import 'server-only';
import { database, send, ticketStatus } from '@/lib/telegram/server';
export async function notifyBusinesses(ids: string[]) {
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
}

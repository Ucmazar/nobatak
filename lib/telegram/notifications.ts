import 'server-only';
import { database, send, ticketStatus } from '@/lib/telegram/server';
type QueueMoveRecord = { id?: unknown; queue_number?: unknown; late_count?: unknown; appointment_date?: unknown; status?: unknown };

export async function notifyQueueMovement(record: QueueMoveRecord, previous: QueueMoveRecord) {
  if (typeof record.id !== 'string' || record.status !== 'waiting' || record.appointment_date !== previous.appointment_date) return false;
  const oldQueue = Number(previous.queue_number);
  const newQueue = Number(record.queue_number);
  const oldLate = Number(previous.late_count ?? 0);
  const newLate = Number(record.late_count ?? 0);
  const movedBack = Number.isFinite(oldQueue) && newQueue > oldQueue && newLate === oldLate + 1;
  const movedForward = Number.isFinite(oldQueue) && newQueue < oldQueue && newLate === oldLate;
  if (!movedBack && !movedForward) return false;

  const db = database();
  const { data: subscription, error } = await db.from('telegram_subscriptions').select('chat_id').eq('appointment_id', record.id).eq('enabled', true).maybeSingle();
  if (error) throw new Error('Subscription lookup failed');
  if (!subscription) return true;
  const status = await ticketStatus(record.id);
  if (!status || status.appointment.status !== 'waiting') return true;
  const fingerprint = `queue-move:${movedBack ? 'back' : 'forward'}:${newQueue}:${newLate}`;
  const { data: claimed, error: claimError } = await db.rpc('claim_telegram_notice', { p_appointment: record.id, p_fingerprint: fingerprint });
  if (claimError) throw new Error('Lease failed');
  if (!claimed) return true;
  try {
    const aheadText = status.ahead === 0
      ? 'اکنون کسی جلوتر از شما نیست و نوبت شما نزدیک است.'
      : `اکنون ${status.ahead.toLocaleString('fa-AF')} نفر جلوتر از شما ${status.ahead === 1 ? 'است' : 'هستند'}.`;
    const message = movedBack
      ? `نوبت شما به دلیل تأخیر یک جایگاه به عقب منتقل شد.\n\nزمان تقریبی جدید: ${status.estimatedTime}\nتعداد تأخیر: ${newLate.toLocaleString('fa-AF')}`
      : `نوبت شما یک جایگاه جلو آمد.\n\n${aheadText}\nزمان تقریبی جدید نوبت: ${status.estimatedTime}`;
    await send(subscription.chat_id, message);
    const { error: doneError } = await db.from('telegram_subscriptions').update({ last_fingerprint: fingerprint, pending_fingerprint: null, lease_until: null }).eq('appointment_id', record.id).eq('pending_fingerprint', fingerprint);
    if (doneError) throw new Error('Notice update failed');
  } catch {
    await db.from('telegram_subscriptions').update({ pending_fingerprint: null, lease_until: null }).eq('appointment_id', record.id).eq('pending_fingerprint', fingerprint);
    throw new Error('Delivery failed');
  }
  return true;
}

export async function notifyBusinesses(ids: string[], completedIds: string[] = [], origin?: string) {
    const db = database();
    const { data, error } = await db.from('telegram_subscriptions').select('appointment_id,chat_id').in('business_id', ids).eq('enabled', true);
    if (error) throw new Error('Subscriptions failed');
    // No send occurs until the customer has explicitly started the bot for this ticket.
    for (const row of data ?? []) {
      const status = await ticketStatus(row.appointment_id); if (!status) continue;
      const completed = status.appointment.status === 'completed' && completedIds.includes(row.appointment_id);
      if (!status.near && !completed) continue;
      const { data: claimed, error: claimError } = await db.rpc('claim_telegram_notice', { p_appointment: row.appointment_id, p_fingerprint: status.fingerprint });
      if (claimError) throw new Error('Lease failed');
      if (!claimed) continue;
      try {
        if (completed) {
          if (!origin) throw new Error('Public origin missing');
          await send(row.chat_id, 'نوبت شما به پایان رسید\n' + status.text, { inline_keyboard: [[{ text: 'ثبت نوبت جدید', url: new URL('/q/' + encodeURIComponent(status.business.slug) + '#book', origin).href }]] });
        } else await send(row.chat_id, 'یادآوری نوبت شما\n' + status.text);
        const { error: doneError } = await db.from('telegram_subscriptions').update({ last_fingerprint: status.fingerprint, pending_fingerprint: null, lease_until: null }).eq('appointment_id', row.appointment_id).eq('pending_fingerprint', status.fingerprint);
        if (doneError) throw new Error('Notice update failed');
      } catch {
        await db.from('telegram_subscriptions').update({ pending_fingerprint: null, lease_until: null }).eq('appointment_id', row.appointment_id).eq('pending_fingerprint', status.fingerprint);
        throw new Error('Delivery failed');
      }
    }
}

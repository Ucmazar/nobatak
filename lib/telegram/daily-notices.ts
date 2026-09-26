import 'server-only';
import { database, send, botReady } from './server';

/** Durable outbox; individual failures don't stop delivery to other customers. */
export async function dispatchDailyNotices(businessId: string | null) {
  const db = database();
  const { data, error } = await db.rpc('claim_daily_notices', { p_business: businessId, p_limit: 20 });
  if (error) throw new Error('Could not claim cancellation notices');
  type Notice = { id: string; chat_id: string; message: string; attempts: number };
  const jobs = (data || []) as Notice[];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      let failure: string | null = null;
      try {
        if (!botReady()) throw new Error('Bot unavailable');
        await send(job.chat_id, job.message);
      } catch { failure = 'Telegram delivery failed; retry required.'; }
      const { error: saveError } = await db.from('daily_cancellation_notices').update({
        status: failure ? 'failed' : 'sent', last_error: failure, lease_until: null,
        sent_at: failure ? null : new Date().toISOString(),
      }).eq('id', job.id).eq('status', 'sending').eq('attempts', job.attempts);
      // A lost acknowledgement remains leased, then becomes retryable after expiry.
      if (saveError) console.error('Could not record cancellation notification outcome', { noticeId: job.id });
    }
  }));
}

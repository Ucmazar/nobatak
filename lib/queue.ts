type QueueEntry = { appointment_date: string; staff_id?: string | null; status: string; queue_number: number };

/** Active people ahead in one staff member's queue on one day. Null is the general queue. */
export function queueAhead(entries: QueueEntry[], date: string, staffId?: string | null, before = Infinity): number {
  return entries.filter(entry => entry.appointment_date === date &&
    (entry.staff_id || null) === (staffId || null) &&
    (entry.status === 'waiting' || entry.status === 'serving') && entry.queue_number < before).length;
}

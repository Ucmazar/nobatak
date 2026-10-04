type QueueEntry = { appointment_date: string; staff_id?: string | null; status: string; queue_number: number };
type WaitEntry = QueueEntry & { updated_at?: string | null; service?: { duration_minutes?: number | null } | null; service_duration_minutes?: number | null };

/** Active people ahead in one staff member's queue on one day. Null is the general queue. */
export function queueAhead(entries: QueueEntry[], date: string, staffId?: string | null, before = Infinity): number {
  return entries.filter(entry => entry.appointment_date === date &&
    (entry.staff_id || null) === (staffId || null) &&
    (entry.status === 'waiting' || entry.status === 'serving') && entry.queue_number < before).length;
}

export function queuePositions<T extends QueueEntry & { id: string }>(entries: T[]): Map<string, number> {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.appointment_date + ':' + (entry.staff_id || '');
    const group = groups.get(key) || []; group.push(entry); groups.set(key, group);
  }
  const result = new Map<string, number>();
  for (const group of groups.values()) {
    let ahead = 0, lastNumber = -Infinity, sameNumber = 0;
    for (const entry of group.sort((a,b) => a.queue_number-b.queue_number)) {
      if (entry.queue_number !== lastNumber) { ahead += sameNumber; sameNumber = 0; lastNumber = entry.queue_number; }
      result.set(entry.id, ahead);
      if (entry.status === 'waiting' || entry.status === 'serving') sameNumber++;
    }
  }
  return result;
}

/** Total work remaining before a queue position. The target customer's own service is never included. */
export function estimatedWaitMinutes(entries: WaitEntry[], date: string, staffId?: string | null, before = Infinity, nowMs = Date.now(), fallbackDuration = 20): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.appointment_date !== date || (entry.staff_id || null) !== (staffId || null) || entry.queue_number >= before || !['waiting', 'serving'].includes(entry.status)) continue;
    const rawDuration = entry.service?.duration_minutes ?? entry.service_duration_minutes ?? fallbackDuration;
    const duration = Number.isFinite(rawDuration) && Number(rawDuration) >= 0 ? Number(rawDuration) : fallbackDuration;
    if (entry.status === 'serving' && entry.updated_at) {
      const startedAt = Date.parse(entry.updated_at);
      if (Number.isFinite(startedAt) && startedAt <= nowMs) { total += Math.max(duration - (nowMs - startedAt) / 60000, 0); continue; }
    }
    total += duration;
  }
  return Math.max(0, Math.ceil(total));
}

import type { Appointment, AppointmentStatus } from '@/types/database';

export type PendingQueueChanges = Map<string, AppointmentStatus | 'delete'>;
export function overlayQueue(rows: Appointment[], changes: PendingQueueChanges): Appointment[] {
  return rows.flatMap(row => {
    const change = changes.get(row.id);
    return change === 'delete' ? [] : [change ? { ...row, status: change } : row];
  });
}

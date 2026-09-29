import { Appointment, AppointmentStatus, Staff } from '@/types/database';
import { useMemo } from 'react';
import { queuePositions } from '@/lib/queue';

export function StaffAppointmentTables({ appointments, allAppointments, staff, pendingActions, onStatusChange, onMove, onDownload }: {
  pendingActions: ReadonlySet<string>;
  appointments: Appointment[]; allAppointments: Appointment[]; staff: Staff[];
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onMove: (appointment: Appointment) => void;
  onDelete?: (id: string) => void;
  onDownload: (appointment: Appointment) => void;
}) {
  const positions = useMemo(() => queuePositions(allAppointments), [allAppointments]);
  const groups = new Map<string, { name: string; rows: Appointment[] }>();
  for (const appointment of appointments) {
    const key = appointment.staff_id || 'unassigned';
    if (!groups.has(key)) groups.set(key, { name: staff.find(person => person.id === key)?.name || appointment.staff?.name || (appointment.staff_id ? 'کارمند پیشین' : 'بدون انتخاب کارمند'), rows: [] });
    groups.get(key)!.rows.push(appointment);
  }
  const labels: Record<AppointmentStatus, string> = { waiting: 'در انتظار', serving: 'در حال خدمت', completed: 'تکمیل‌شده', cancelled: 'لغوشده' };

  return <div className="space-y-5">{[...groups].map(([id, group]) => <section key={id} className="workspace-appointment-section">
    <h3>{group.name}<span>{group.rows.length.toLocaleString('fa-AF')} نوبت</span></h3>
    <div className="overflow-x-auto"><table className="workspace-appointments-table w-full text-right text-sm">
      <caption className="sr-only">نوبت‌های {group.name}</caption>
      <thead><tr>{['شماره', 'مشتری / خدمت', 'شماره تلفن', 'افراد قبل از شما', 'وضعیت', 'اقدام'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{[...group.rows].sort((a,b) => a.queue_number-b.queue_number).map(app => <tr key={app.id} className={app.status === 'serving' ? 'is-serving' : ''}>
        <td data-label="شماره" className="workspace-queue-number">{app.queue_number.toLocaleString('fa-AF')}</td>
        <td data-label="مشتری / خدمت"><div><p className="flex flex-wrap items-center gap-2 font-bold text-slate-900">{app.customer_name}{app.late_count > 0 && <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">تأخیر {app.late_count.toLocaleString('fa-AF')}</span>}</p><p className="text-xs text-slate-500">{app.service?.name || '—'}</p></div></td>
        <td data-label="شماره تلفن"><span dir="ltr" className="inline-block">{app.customer_phone || '—'}</span></td>
        <td data-label="افراد قبل از شما">{app.status === 'waiting' ? (positions.get(app.id) ?? 0).toLocaleString('fa-AF') : '—'}</td>
        <td data-label="وضعیت"><span className={`workspace-status-pill workspace-status-${app.status}`}>{labels[app.status]}</span></td>
        <td data-label="اقدام"><fieldset disabled={pendingActions.has('appointment:' + app.id)} aria-busy={pendingActions.has('appointment:' + app.id)} className="workspace-row-actions disabled:opacity-60 [&:disabled_button]:cursor-wait">
          {app.status === 'waiting' && <button type="button" onClick={() => onStatusChange(app.id, 'serving')} className="workspace-action-primary">شروع نوبت</button>}
          {app.status === 'waiting' && <button type="button" onClick={() => onMove(app)} className="workspace-action-move">انتقال</button>}
          {app.status === 'serving' && <button type="button" onClick={() => onStatusChange(app.id, 'completed')} className="workspace-action-success">پایان نوبت</button>}
          {['waiting','serving'].includes(app.status) && <button type="button" onClick={() => onStatusChange(app.id, 'cancelled')}>لغو نوبت</button>}
          <button type="button" onClick={() => onDownload(app)}>دریافت رسید</button>
          <span role="status">{pendingActions.has('appointment:' + app.id) ? 'در حال انجام…' : ''}</span>
        </fieldset></td>
      </tr>)}</tbody>
    </table></div>
  </section>)}</div>;
}

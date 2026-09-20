import { Appointment, AppointmentStatus, Staff } from '@/types/database';
import { queueAhead } from '@/lib/queue';

export function StaffAppointmentTables({ appointments, allAppointments, staff, onStatusChange, onDelete, onDownload }: {
  appointments: Appointment[]; allAppointments: Appointment[]; staff: Staff[];
  onStatusChange: (id: string, status: AppointmentStatus) => void;
  onDelete: (id: string) => void; onDownload: (appointment: Appointment) => void;
}) {
  const groups = new Map<string, { name: string; rows: Appointment[] }>();
  for (const appointment of appointments) {
    const key = appointment.staff_id || 'unassigned';
    if (!groups.has(key)) groups.set(key, { name: staff.find(person => person.id === key)?.name || appointment.staff?.name || (appointment.staff_id ? 'کارمند پیشین' : 'بدون انتخاب کارمند'), rows: [] });
    groups.get(key)!.rows.push(appointment);
  }
  const labels: Record<AppointmentStatus, string> = { waiting: 'در انتظار', serving: 'در حال خدمت', completed: 'انجام‌شده', cancelled: 'لغوشده' };
  return <div className="space-y-6">{[...groups].map(([id, group]) => <section key={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <h3 className="bg-slate-50 px-4 py-3 font-bold text-slate-900">{group.name} <span className="mr-2 text-xs font-normal text-slate-500">{group.rows.length.toLocaleString('fa-AF')} نوبت</span></h3>
    <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-sm">
      <caption className="sr-only">نوبت‌های {group.name}</caption>
      <thead className="border-y border-slate-100 text-xs text-slate-500"><tr>{['شماره رسید', 'مشتری / خدمت', 'افراد جلوتر در همین صف', 'وضعیت', 'عملیات'].map(title => <th key={title} scope="col" className="p-3">{title}</th>)}</tr></thead>
      <tbody>{[...group.rows].sort((a,b) => a.queue_number-b.queue_number).map(app => <tr key={app.id} className={app.status === 'serving' ? 'border-b border-slate-100 bg-blue-50' : 'border-b border-slate-100'}>
        <td className="p-3 font-bold">{app.queue_number.toLocaleString('fa-AF')}</td>
        <td className="p-3"><p className="font-semibold">{app.customer_name}</p><p className="text-xs text-slate-500">{app.service?.name || '—'}</p>{app.customer_phone && <p dir="ltr" className="text-right text-xs text-slate-500">{app.customer_phone}</p>}</td>
        <td className="p-3">{app.status === 'waiting' ? queueAhead(allAppointments, app.appointment_date, app.staff_id, app.queue_number).toLocaleString('fa-AF') : '—'}</td>
        <td className="p-3">{labels[app.status]}</td>
        <td className="p-3"><div className="flex flex-wrap gap-2 text-xs">
          {app.status === 'waiting' && <button onClick={() => onStatusChange(app.id, 'serving')} className="rounded-lg bg-blue-600 px-3 py-2 text-white">شروع نوبت</button>}
          {app.status === 'serving' && <button onClick={() => onStatusChange(app.id, 'completed')} className="rounded-lg bg-emerald-600 px-3 py-2 text-white">پایان نوبت</button>}
          {['waiting','serving'].includes(app.status) && <button onClick={() => onStatusChange(app.id, 'cancelled')} className="rounded-lg border px-3 py-2">لغو نوبت</button>}
          <button onClick={() => onDownload(app)} className="rounded-lg border px-3 py-2">دریافت رسید</button>
          <button onClick={() => onDelete(app.id)} className="rounded-lg px-3 py-2 text-rose-600">حذف</button>
        </div></td>
      </tr>)}</tbody>
    </table></div>
  </section>)}</div>;
}

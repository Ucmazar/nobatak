'use client';

import { useState } from 'react';
import type { Business } from '@/types/database';
import { updateBusiness } from '@/lib/services/businesses';
import { usePendingActions } from '@/lib/use-pending-actions';
import { Button } from '@/components/ui/Button';

export function DeviceBookingLimitSetting({ business, onSaved }: { business: Business; onSaved: (business: Business) => void }) {
  const [value, setValue] = useState<string>(business.max_active_appointments_per_device === null ? 'unlimited' : String(business.max_active_appointments_per_device ?? 3));
  const [grace, setGrace] = useState(String(business.no_show_grace_minutes ?? 5));
  const [message, setMessage] = useState('');
  const { runAction, isPending } = usePendingActions();
  async function save() {
    await runAction('device-booking-limit', async () => {
      setMessage('');
      const limit = value === 'unlimited' ? null : Number(value);
      const { business: updated, error } = await updateBusiness(business.id, { max_active_appointments_per_device: limit, no_show_grace_minutes: Number(grace) });
      if (error || !updated) { setMessage(error || 'ذخیره انجام نشد.'); return; }
      onSaved(updated);
      setMessage('قواعد نوبت‌گیری ذخیره شد.');
    });
  }

  const pending = isPending('device-booking-limit');
  const fieldClass = 'mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';
  return <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
    <h3 className="text-sm font-bold text-slate-900">قواعد نوبت‌گیری مشتری</h3>
    <p className="mt-1 text-xs leading-6 text-slate-600">سقف نوبت فعال هر مرورگر و مهلت حضور مشتری را تعیین کنید.</p>
    <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <label className="block min-w-0 text-xs font-semibold text-slate-700">تعداد نوبت فعال مجاز برای هر مرورگر<select value={value} disabled={pending} onChange={event => setValue(event.target.value)} className={fieldClass}><option value="1">۱ نوبت</option><option value="2">۲ نوبت</option><option value="3">۳ نوبت</option><option value="5">۵ نوبت</option><option value="unlimited">بدون محدودیت</option></select></label>
      <label className="block min-w-0 text-xs font-semibold text-slate-700">مهلت حضور پس از رسیدن نوبت<select value={grace} disabled={pending} onChange={event => setGrace(event.target.value)} className={fieldClass}><option value="0">بدون مهلت</option><option value="5">۵ دقیقه</option><option value="10">۱۰ دقیقه</option><option value="15">۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option></select></label>
      <Button type="button" className="h-11 w-full sm:col-span-2 lg:col-span-1 lg:w-auto" onClick={() => void save()} isLoading={pending}>ذخیره قواعد</Button>
    </div>
    {message && <p role="status" className="mt-3 text-xs font-semibold text-slate-700">{message}</p>}
  </section>;
}

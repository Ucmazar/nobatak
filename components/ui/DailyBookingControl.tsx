'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from './Button';
import { supabase } from '@/lib/supabase/client';
import { usePendingActions } from '@/lib/use-pending-actions';
import { createLiveRefresh } from '@/lib/live-refresh';
import type { BookingDay, NoticeSummary } from '@/lib/booking-day';
import { isoToAfghaniDate } from '@/lib/afghaniMonths';

export function DailyBookingControl({ businessId, date, onChanged }: { businessId: string; date: string; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const [day, setDay] = useState<BookingDay | null>(null);
  const [notices, setNotices] = useState<NoticeSummary | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const { runAction, isPending } = usePendingActions();
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const currentBusiness = useRef(businessId);
  useEffect(() => { currentBusiness.current = businessId; }, [businessId, date]);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/business-day?businessId=' + encodeURIComponent(businessId) + '&date=' + encodeURIComponent(date), { cache: 'no-store' });
      const data = await response.json();
      if (currentBusiness.current !== businessId) return;
      if (!response.ok) throw new Error(data.error);
      setDay(data.day); setNotices(data.notices);
    } catch (error) { if (currentBusiness.current === businessId) setMessage(error instanceof Error ? error.message : 'دریافت وضعیت روز انتخاب‌شده انجام نشد.'); }
  }, [businessId, date]);
  useEffect(() => {
    const sync = createLiveRefresh(refresh, () => document.visibilityState !== 'hidden' && navigator.onLine);
    sync.request();
    const channel = supabase.channel('booking-day-owner:' + businessId).on('postgres_changes', {
      event: '*', schema: 'public', table: 'business_day_closures', filter: 'business_id=eq.' + businessId,
    }, sync.request).subscribe(sync.connection);
    window.addEventListener('focus', sync.request);
    document.addEventListener('visibilitychange', sync.request);
    return () => { sync.close(); window.removeEventListener('focus', sync.request); document.removeEventListener('visibilitychange', sync.request); void supabase.removeChannel(channel); };
  }, [businessId, refresh]);
  async function update(closed: boolean) {
    return runAction('day', async () => {
      if (closed && reason.trim().length < 3) { setMessage('دلیل را وارد کنید؛ مثلاً رخصتی یا مریضی.'); return; }
      if (closed && !confirm('پذیرش این روز بسته شود؟ نوبت‌های اجرا‌نشده به روز بعد می‌روند؛ در صورت کمبود ظرفیت، نوبت‌های روزهای بعد نیز یک روز جلو می‌روند.')) return;
      const signature = JSON.stringify([businessId, date, closed, reason.trim()]);
      if (requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
      try {
        const response = await fetch('/api/business-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, date, closed, reason: reason.trim(), requestId: requestRef.current.id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMessage(closed ? 'پذیرش بسته شد؛ ' + result.result.moved + ' نوبت منتقل شد. تاریخ جدید به مشتریان متصل به تلگرام اطلاع داده می‌شود.' : 'پذیرش این روز دوباره باز شد.');
        requestRef.current = null; setReason('');
        await refresh(); onChanged();
      } catch (error) { setMessage(error instanceof Error ? error.message : 'پاسخ دریافت نشد؛ وضعیت را بررسی کنید.'); await refresh(); onChanged(); }
    });
  }
  async function retry() {
    return runAction('notices', async () => {
      try {
        const response = await fetch('/api/business-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, action: 'retry' }) });
        if (!response.ok) throw new Error();
        setMessage('ارسال پیام‌های باقی‌مانده شروع شد؛ برای دیدن نتیجه، بررسی ارسال را بزنید.');
        await refresh();
      } catch { setMessage('شروع ارسال انجام نشد؛ دوباره تلاش کنید.'); }
    });
  }
  return <section className="space-y-3" aria-label="تنظیم رخصتی و پذیرش">
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'بستن تنظیمات رخصتی' : 'تنظیم رخصتی و پذیرش'}
      </Button>
      {day?.is_closed && <span className="text-xs font-semibold text-rose-700">پذیرش روز انتخاب‌شده بسته است</span>}
    </div>
    <div id={panelId} hidden={!expanded} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    <h3 className="font-bold">پذیرش نوبت برای روز انتخاب‌شده {day && '— ' + isoToAfghaniDate(day.booking_date)}</h3>
    {day ? <p className="text-sm">{day.is_closed ? 'دریافت نوبت روز انتخاب‌شده بسته است. دلیل: ' + day.reason : 'دریافت نوبت روز انتخاب‌شده باز است.'}</p> : <p role="status" className="text-sm">در حال دریافت وضعیت روز انتخاب‌شده…</p>}
    <fieldset disabled={!day || isPending('day')} className="space-y-3">
      <label className="block text-sm">دلیل بستن پذیرش (اجباری)<input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="مثلاً رخصتی یا مریضی" className="mt-1 block w-full rounded-xl border p-2" /></label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" isLoading={isPending('day')} onClick={() => update(true)}>بستن پذیرش روز انتخاب‌شده</Button>
        {day?.is_closed && <Button type="button" isLoading={isPending('day')} onClick={() => update(false)}>بازکردن پذیرش روز انتخاب‌شده</Button>}
      </div>
    </fieldset>
    {message && <p role="status" className="text-sm text-blue-800">{message}</p>}
    {notices && <div className="border-t pt-3 text-xs space-y-2"><p>پیام‌های انتقال: ارسال‌شده {notices.sent} · در انتظار {notices.pending} · در حال ارسال {notices.sending} · ناموفق {notices.failed}</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" isLoading={isPending('check')} onClick={() => runAction('check', refresh)}>بررسی ارسال</Button>
      {(notices.pending > 0 || notices.failed > 0) && <Button size="sm" isLoading={isPending('notices')} onClick={retry}>ارسال باقی‌مانده / تلاش دوباره</Button>}</div>
    </div>}
    </div>
  </section>;
}

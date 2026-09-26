'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { supabase } from '@/lib/supabase/client';
import { usePendingActions } from '@/lib/use-pending-actions';
import { createLiveRefresh } from '@/lib/live-refresh';
import type { BookingDay, NoticeSummary } from '@/lib/booking-day';
import { isoToAfghaniDate } from '@/lib/afghaniMonths';

export function DailyBookingControl({ businessId, onChanged }: { businessId: string; onChanged: () => void }) {
  const [day, setDay] = useState<BookingDay | null>(null);
  const [notices, setNotices] = useState<NoticeSummary | null>(null);
  const [reason, setReason] = useState('');
  const [cancelToday, setCancelToday] = useState(false);
  const [message, setMessage] = useState('');
  const { runAction, isPending } = usePendingActions();
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const currentBusiness = useRef(businessId);
  useEffect(() => { currentBusiness.current = businessId; }, [businessId]);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/business-day?businessId=' + encodeURIComponent(businessId), { cache: 'no-store' });
      const data = await response.json();
      if (currentBusiness.current !== businessId) return;
      if (!response.ok) throw new Error(data.error);
      setDay(data.day); setNotices(data.notices);
    } catch (error) { if (currentBusiness.current === businessId) setMessage(error instanceof Error ? error.message : 'دریافت وضعیت امروز انجام نشد.'); }
  }, [businessId]);
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
      if ((closed || cancelToday) && reason.trim().length < 3) { setMessage('دلیل را وارد کنید؛ مثلاً رخصتی یا مریضی.'); return; }
      if (cancelToday && !confirm('فقط نوبت‌های در انتظار و در حال خدمت امروز لغو شوند؟ این کار قابل بازگردانی خودکار نیست.')) return;
      const signature = JSON.stringify([businessId, closed, cancelToday, reason.trim()]);
      if (requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
      try {
        const response = await fetch('/api/business-day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId, closed, cancelToday, reason: reason.trim(), requestId: requestRef.current.id }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setMessage('ذخیره شد؛ ' + result.result.cancelled + ' نوبت امروز لغو شد. پیام‌های مشتریان متصل در صف ارسال قرار گرفتند.');
        requestRef.current = null; setCancelToday(false); setReason('');
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
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" aria-label="پذیرش امروز">
    <h3 className="font-bold">پذیرش نوبت فقط برای امروز {day && '— ' + isoToAfghaniDate(day.booking_date)}</h3>
    {day ? <p className="text-sm">{day.is_closed ? 'دریافت نوبت امروز بسته است. دلیل: ' + day.reason : 'دریافت نوبت امروز باز است.'}</p> : <p role="status" className="text-sm">در حال دریافت وضعیت امروز…</p>}
    <fieldset disabled={!day || isPending('day')} className="space-y-3">
      <label className="block text-sm">دلیل توقف یا لغو (اجباری)<input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="مثلاً رخصتی یا مریضی" className="mt-1 block w-full rounded-xl border p-2" /></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={cancelToday} onChange={e => setCancelToday(e.target.checked)} />نوبت‌های فعال امروز هم لغو و به مشتریان متصل به تلگرام اطلاع داده شود.</label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" isLoading={isPending('day')} onClick={() => update(true)}>بستن پذیرش امروز</Button>
        {day?.is_closed && <Button type="button" isLoading={isPending('day')} onClick={() => update(false)}>بازکردن پذیرش امروز</Button>}
        {!day?.is_closed && cancelToday && <Button type="button" variant="outline" isLoading={isPending('day')} onClick={() => update(false)}>فقط لغو نوبت‌های امروز</Button>}
      </div>
    </fieldset>
    {message && <p role="status" className="text-sm text-blue-800">{message}</p>}
    {notices && <div className="border-t pt-3 text-xs space-y-2"><p>پیام‌های لغو: ارسال‌شده {notices.sent} · در انتظار {notices.pending} · در حال ارسال {notices.sending} · ناموفق {notices.failed}</p>
      <div className="flex gap-2"><Button size="sm" variant="outline" isLoading={isPending('check')} onClick={() => runAction('check', refresh)}>بررسی ارسال</Button>
      {(notices.pending > 0 || notices.failed > 0) && <Button size="sm" isLoading={isPending('notices')} onClick={retry}>ارسال باقی‌مانده / تلاش دوباره</Button>}</div>
    </div>}
  </section>;
}

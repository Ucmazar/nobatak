'use client';
import { useState } from 'react';
import Link from 'next/link';

type Report = { message: string; connected?: boolean; pending?: number; previousError?: boolean; notificationConfigured?: boolean };
export default function TelegramAdminPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  async function check(register: boolean) {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/telegram', { method: register ? 'POST' : 'GET', cache: 'no-store' });
      const result = await response.json();
      setReport(result);
    } catch { setReport({ message: 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.' }); }
    finally { setBusy(false); }
  }
  return <main dir="rtl" className="min-h-screen bg-slate-950 text-white p-6">
    <section className="max-w-xl mx-auto mt-12 space-y-5 rounded-2xl border border-slate-700 p-6">
      <Link href="/admin" className="text-sky-300">بازگشت به مدیریت</Link>
      <h1 className="text-2xl font-bold">اتصال ربات تلگرام</h1>
      <p className="text-slate-300 leading-7">با حساب سوپرادمین وارد شوید. اتصال از کلیدهای ذخیره‌شده در سرور استفاده می‌کند؛ واردکردن مجدد توکن لازم نیست.</p>
      <div className="flex gap-3 flex-wrap">
        <button disabled={busy} onClick={() => check(false)} className="rounded-xl border border-slate-500 px-4 py-3 disabled:opacity-50">بررسی وضعیت</button>
        <button disabled={busy} onClick={() => check(true)} className="rounded-xl bg-sky-600 px-4 py-3 disabled:opacity-50">اتصال / اصلاح دریافت پیام‌ها</button>
      </div>
      <div role="status" aria-live="polite" className="space-y-3">
        {busy ? <p>در حال بررسی…</p> : report && <>
          <p>{report.message}</p>
          {report.pending !== undefined && <p>پیام‌های منتظر دریافت: {report.pending.toLocaleString('fa-AF')}</p>}
          {report.previousError && <p className="text-amber-300">تلگرام یک خطای قبلی در تحویل پیام گزارش کرده؛ پس از اتصال، یک پیام تازه بفرستید.</p>}
          {report.notificationConfigured === false && <p className="text-amber-300">کلید اعلان خودکار تغییر صف هنوز در سرور تنظیم نشده است.</p>}
          {report.connected && <a href="https://t.me/nobatech_bot" target="_blank" rel="noopener noreferrer" className="block text-sky-300">باز کردن ربات برای آزمایش</a>}
        </>}
      </div>
      <p className="text-sm text-slate-400">ثبت اتصال، دریافت پیام ربات را تنظیم می‌کند. اعلان خودکار تغییر صف به تنظیم وب‌هوک دیتابیس هم نیاز دارد.</p>
    </section>
  </main>;
}

'use client';
import { useEffect, useState } from 'react';
export function TelegramButton({ appointmentId, appointmentIds = [appointmentId] }: { appointmentId: string; appointmentIds?: string[] }) {
  const idsKey = [...new Set(appointmentIds)].sort().join(',');
  const [state, setState] = useState({ id: '', link: '', message: 'در حال بررسی امکان اطلاع‌رسانی…' });
  useEffect(() => {
    let disposed = false;
    Promise.resolve().then(async () => {
      const response = await fetch('/api/telegram/config', { cache: 'no-store' });
      if (!response.ok) throw new Error('Unavailable');
      const config = await response.json();
      let token: string | null = null;
      try { token = localStorage.getItem('nobatak_ticket_' + appointmentId); } catch { /* Browser storage unavailable. */ }
      let bundleLink = '';
      if (config.enabled) {
        const tokens: string[] = [];
        for (const id of idsKey.split(',')) {
          const saved = localStorage.getItem('nobatak_ticket_' + id);
          if (saved) tokens.push(saved);
        }
        if (tokens.length > 1) {
          const bundleResponse = await fetch('/api/telegram/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }) });
          const bundle = await bundleResponse.json();
          if (!bundleResponse.ok) { if (!disposed) setState({ id: idsKey, link: '', message: bundle.error || 'اتصال همهٔ نوبت‌ها انجام نشد.' }); return; }
          bundleLink = bundle.link;
        }
      }
      if (!disposed) setState({ id: idsKey,
        link: bundleLink || (config.enabled && token ? 'https://t.me/nobatech_bot?start=' + encodeURIComponent(token) : ''),
        message: !config.enabled ? 'اطلاع‌رسانی تلگرام هنوز فعال نشده است.' : !token ? 'این رسید لینک اتصال تلگرام ندارد. اتصال تلگرام برای نوبت‌هایی که از زمان فعال‌سازی ثبت می‌شوند در دسترس است؛ نوبت فعلی شما همچنان در همین صفحه قابل پیگیری است.' : '',
      });
    }).catch(() => { if (!disposed) setState({ id: idsKey, link: '', message: 'بررسی اتصال تلگرام ممکن نشد. کمی بعد دوباره تلاش کنید.' }); });
    return () => { disposed = true; };
  }, [appointmentId, idsKey]);
  const link = state.id === idsKey ? state.link : '';
  const message = state.id === idsKey ? state.message : 'در حال بررسی امکان اطلاع‌رسانی…';
  const style = 'block w-full rounded-xl px-4 py-3 text-center text-sm font-bold';
  return <div className="space-y-2">
    {link ? <a href={link} target="_blank" rel="noopener noreferrer" className={style + ' bg-sky-500 hover:bg-sky-600 text-white'}>اطلاع‌رسانی با تلگرام</a>
      : <button type="button" disabled aria-describedby="telegram-availability" className={style + ' bg-sky-100 text-sky-700 cursor-not-allowed'}>اطلاع‌رسانی با تلگرام</button>}
    {message && <p id="telegram-availability" role="status" className="text-center text-xs leading-5 text-slate-500">{message}</p>}
  </div>;
}

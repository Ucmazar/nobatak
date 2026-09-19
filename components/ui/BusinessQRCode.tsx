'use client';
import { useEffect, useState } from 'react';
import { businessPublicURL, makeBusinessPoster } from '@/lib/business-poster';

export function BusinessQRCode({ name, slug, phone }: { name: string; slug: string; phone?: string | null }) {
  const signature = JSON.stringify([name, slug, phone]);
  const [result, setResult] = useState({ signature: '', image: '', error: '' });
  const [printError, setPrintError] = useState('');
  const current = result.signature === signature;
  const image = current ? result.image : '';
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      const target = businessPublicURL(window.location.origin, slug, process.env.NEXT_PUBLIC_SITE_URL);
      return makeBusinessPoster(name, target, phone);
    }).then(image => {
      if (!cancelled) setResult({ signature, image, error: '' });
    }).catch((error: unknown) => {
      if (!cancelled) setResult({ signature, image: '', error: error instanceof Error && error.message === 'PUBLIC_SITE_URL_REQUIRED' ? 'آدرس آنلاین کسب‌وکار هنوز تنظیم نشده است.' : 'ساخت برگه انجام نشد. صفحه را دوباره باز کنید.' });
    });
    return () => { cancelled = true; };
  }, [name, slug, phone, signature]);

  async function printPoster() {
    setPrintError('');
    const popup = window.open('', '_blank', 'width=800,height=900');
    if (!popup) { setPrintError('برای چاپ، اجازهٔ بازشدن پنجرهٔ جدید را بدهید.'); return; }
    const doc = popup.document; doc.title = `کیوآر ${name}`;
    const style = doc.createElement('style');
    style.textContent = '@page{size:A4;margin:8mm}body{margin:0;text-align:center}img{display:block;width:100%;max-width:194mm;height:auto;margin:auto}@media print{img{max-height:280mm;object-fit:contain}}';
    doc.head.append(style);
    const poster = doc.createElement('img'); poster.src = image; poster.alt = name; doc.body.append(poster);
    try { await poster.decode(); if (!popup.closed) { popup.focus(); popup.print(); } }
    catch { setPrintError('برگه برای چاپ آماده نشد. دوباره تلاش کنید.'); popup.close(); }
  }
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4" aria-label="کیوآر کسب‌وکار">
    <div><h3 className="font-bold text-slate-900">برگهٔ کیوآر دریافت نوبت</h3><p className="mt-1 text-xs leading-6 text-slate-500">برگه را چاپ کنید یا تصویر کامل آن را دریافت کنید و داخل دکان نصب کنید.</p></div>
    {(printError || (current && result.error)) && <p role="alert" className="text-sm text-rose-600">{printError || result.error}</p>}
    <div className="flex flex-col sm:flex-row items-center gap-5">
      {/* The same raster poster is used for preview, download, and printing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image} alt={`برگهٔ کیوآر ${name}`} width={226} height={320} className="rounded-xl bg-white border border-slate-200" /> : <div className="h-[320px] w-[226px] grid place-items-center text-xs text-slate-500">{current && result.error ? 'برگه آماده نیست' : 'در حال آماده‌سازی برگه…'}</div>}
      <div className="min-w-0 flex-1 space-y-4"><p className="font-bold text-sm">{name}</p>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!image} onClick={printPoster} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">چاپ برگهٔ کیوآر</button>{image && <a href={image} download={`nobatak-${slug}-poster.png`} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">دریافت تصویر کامل PNG</a>}</div>
      </div>
    </div>
  </section>;
}

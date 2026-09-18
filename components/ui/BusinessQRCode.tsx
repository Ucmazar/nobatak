'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function BusinessQRCode({ name, slug, phone }: { name: string; slug: string; phone?: string | null }) {
  const [image, setImage] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [local, setLocal] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

    try {
      const target = new URL(`/q/${encodeURIComponent(slug)}`, base);
      if (!['https:', 'http:'].includes(target.protocol)) throw new Error('Invalid URL');


      QRCode.toDataURL(target.href, { width: 1200, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0f172aff', light: '#ffffffff' } })
        .then(result => { if (!cancelled) { setImage(result); setUrl(target.href); setLocal(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)); } })
        .catch(() => { if (!cancelled) setError('ساخت کیوآر انجام نشد. صفحه را دوباره باز کنید.'); });
    } catch { queueMicrotask(() => { if (!cancelled) setError('آدرس عمومی سایت معتبر نیست.'); }); }
    return () => { cancelled = true; };
  }, [slug]);

  async function printPoster() {
    const popup = window.open('', '_blank', 'width=800,height=900');
    if (!popup) { setError('برای چاپ، اجازهٔ بازشدن پنجرهٔ جدید را بدهید.'); return; }
    const doc = popup.document;
    doc.title = `کیوآر ${name}`;
    doc.documentElement.lang = 'fa';
    doc.documentElement.dir = 'rtl';
    const style = doc.createElement('style');
    style.textContent = '@page{size:A4;margin:15mm}*{box-sizing:border-box}body{font-family:Tahoma,sans-serif;text-align:center;color:#0f172a;margin:0;padding:12mm;border:2px solid #0891b2;border-radius:20px}h1{font-size:36px;line-height:1.6;overflow-wrap:anywhere;margin:16px 0;font-weight:900}p{font-size:18px;line-height:1.8;margin:10px 0}.logo{width:140px}.qr{display:block;width:105mm;max-width:100%;margin:12px auto}.url{font-size:11px;overflow-wrap:anywhere;direction:ltr;color:#475569}.hint{font-size:14px;color:#64748b}.site{font-size:13px;color:#0e7490}.contacts{display:flex;justify-content:center;flex-wrap:wrap;gap:12px 28px;border-top:1px solid #cbd5e1;padding-top:16px;margin-top:20px}.contact{font-size:12px;color:#475569}.phone{display:block;direction:ltr;font-size:19px;font-weight:bold;color:#0f172a;margin-top:4px}@media print{body{break-inside:avoid}}';
    doc.head.append(style);
    const logo = doc.createElement('img'); logo.src = new URL('/logo-transparent.png', window.location.origin).href; logo.className = 'logo'; logo.alt = 'نوبتک';
    const heading = doc.createElement('h1'); heading.textContent = name;
    const instruction = doc.createElement('p'); instruction.textContent = 'برای گرفتن نوبت، کیوآر را با دوربین موبایل اسکن کنید';
    const qr = doc.createElement('img'); qr.src = image; qr.className = 'qr'; qr.alt = 'کیوآر ثبت نوبت';
    const link = doc.createElement('p'); link.className = 'url'; link.textContent = url;
    const hint = doc.createElement('p'); hint.className = 'hint'; hint.textContent = 'نوبت‌دهی آسان با نوبتک';
    const site = doc.createElement('p'); site.className = 'site'; site.textContent = 'نوبتک | سیستم مدیریت نوبت • ' + new URL(url).host;
    const contacts = doc.createElement('div'); contacts.className = 'contacts';
    for (const [label, number] of [['تماس کسب‌وکار', phone]]) {
      if (!number?.trim()) continue;
      const item = doc.createElement('div'); item.className = 'contact'; item.textContent = label ?? null;
      const value = doc.createElement('span'); value.className = 'phone'; value.textContent = number ?? null;
      item.append(value); contacts.append(item);
    }
    doc.body.append(logo, site, heading, qr, instruction, link);
    if (contacts.childElementCount) doc.body.append(contacts);
    doc.body.append(hint);
    await Promise.all([logo.decode().catch(() => {}), qr.decode()]);
    if (!popup.closed) { popup.focus(); popup.print(); }
  }

  return <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4" aria-label="کیوآر کسب‌وکار">
    <div><h3 className="font-bold text-slate-900">کیوآر دریافت نوبت</h3><p className="mt-1 text-xs leading-6 text-slate-500">این کیوآر را چاپ کنید و داخل دکان نصب کنید تا مشتریان مستقیم به صفحهٔ نوبت‌گیری شما برسند.</p></div>
    {local && <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs leading-6 text-amber-900">این نسخه روی کمپیوتر شما اجرا می‌شود. برای نصب در دکان، کیوآر را پس از انتشار سایت با آدرس عمومی دریافت کنید؛ لینک فعلی روی موبایل مشتری باز نمی‌شود.</p>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    <div className="flex flex-col sm:flex-row items-center gap-5">
      {image ? <img src={image} alt={`کیوآر نوبت‌گیری ${name}`} width={200} height={200} className="rounded-xl bg-white border border-slate-200" /> : <div className="h-[200px] w-[200px] grid place-items-center text-xs text-slate-500">{error ? 'کیوآر آماده نیست' : 'در حال ساخت کیوآر…'}</div>}
      <div className="min-w-0 flex-1 space-y-4"><p className="font-bold text-sm">{name}</p><a href={url || undefined} target="_blank" rel="noopener noreferrer" dir="ltr" className="block break-all text-xs text-blue-600">{url}</a>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!image} onClick={printPoster} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">چاپ برگهٔ کیوآر</button>{image && <a href={image} download={`nobatak-${slug}-qr.png`} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">دریافت تصویر PNG</a>}</div>
      </div>
    </div>
  </section>;
}


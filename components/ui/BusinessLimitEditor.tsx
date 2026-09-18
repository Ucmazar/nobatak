'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Infinity as InfinityIcon, LoaderCircle, AlertCircle, X } from 'lucide-react';
import { setUserBusinessLimit } from '@/lib/services/admin';

export function BusinessLimitEditor({ userId, limit, count, onSaved }: {
  userId: string; limit: number | null | undefined; count: number;
  onSaved: (limit: number | null) => void;
}) {
  const [value, setValue] = useState(limit === null ? '' : String(limit ?? 1));
  const [unlimited, setUnlimited] = useState(limit === null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const saved = useRef(limit ?? (limit === null ? null : 1));
  const busy = useRef(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissal = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
      if (dismissal.current) clearTimeout(dismissal.current);
    };
  }, []);

  function notify(text: string, error = false) {
    if (dismissal.current) clearTimeout(dismissal.current);
    setToast({ text, error });
    dismissal.current = setTimeout(() => setToast(null), error ? 6000 : 2500);
  }

  async function save(next: number | null) {
    if (debounce.current) clearTimeout(debounce.current);
    if (busy.current || next === saved.current) return;
    busy.current = true;
    setSaving(true);
    setInvalid(false);
    setToast(null);
    try {
      const result = await setUserBusinessLimit(userId, next);
      if (!mounted.current) return;
      if (!result.success) throw new Error(result.error || 'ذخیره انجام نشد.');
      saved.current = next;
      setUnlimited(next === null);
      setValue(next === null ? '' : String(next));
      onSaved(next);
      notify('سقف کسب‌وکار ذخیره شد');
    } catch (error) {
      if (!mounted.current) return;
      setValue(saved.current === null ? '' : String(saved.current));
      setUnlimited(saved.current === null);
      notify(error instanceof Error ? error.message : 'ذخیره انجام نشد. دوباره تلاش کنید.', true);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  function change(raw: string) {
    setValue(raw);
    if (debounce.current) clearTimeout(debounce.current);
    const next = Number(raw);
    const valid = raw.trim() !== '' && Number.isSafeInteger(next) && next >= 0 && next <= 2147483647;
    setInvalid(raw !== '' && !valid);
    // An empty field while typing must never silently remove the quota.
    if (valid) debounce.current = setTimeout(() => { void save(next); }, 700);
  }

  return <>
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      <div className={`inline-flex h-9 items-center overflow-hidden rounded-lg border bg-slate-950/60 transition-colors focus-within:border-indigo-400 ${invalid ? 'border-rose-500' : 'border-slate-700'}`}>
        <input aria-label="سقف تعداد کسب‌وکار" aria-invalid={invalid} type="number" min="0" max="2147483647" step="1"
          value={unlimited ? '' : value} placeholder={unlimited ? 'نامحدود' : 'تعداد'} disabled={saving || unlimited}
          onChange={event => change(event.target.value)}
          onBlur={() => { if (!unlimited && value.trim() === '') { setInvalid(true); notify('عدد سقف را وارد کنید؛ برای نامحدود از دکمهٔ ∞ استفاده کنید.', true); } }}
          onKeyDown={event => { if (event.key === 'Enter' && value.trim() !== '' && !invalid) { event.preventDefault(); void save(Number(value)); } }}
          title="ذخیرهٔ خودکار · صفر یعنی جلوگیری از ایجاد کسب‌وکار جدید"
          className="h-full w-20 bg-transparent px-2 text-center text-xs tabular-nums text-slate-100 outline-none disabled:opacity-60" />
        <button type="button" aria-label={unlimited ? 'تعیین سقف یک کسب‌وکار' : 'بدون محدودیت'} aria-pressed={unlimited}
          title={unlimited ? 'تعیین سقف یک کسب‌وکار' : 'بدون محدودیت'} disabled={saving}
          onClick={() => { void save(unlimited ? 1 : null); }}
          className={`grid h-9 w-8 place-items-center border-r border-slate-700 transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-50 ${unlimited ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'}`}>
          {saving ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" aria-label="در حال ذخیره" /> : <InfinityIcon size={16} />}
        </button>
      </div>
      <span className="text-[10px] tabular-nums text-slate-500" title="تعداد کسب‌وکارهای ثبت‌شده">{count} ثبت‌شده</span>
    </div>
    {toast && createPortal(
      <div dir="rtl" role={toast.error ? 'alert' : 'status'} className={`fixed bottom-6 left-1/2 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 text-xs shadow-2xl ${toast.error ? 'border-rose-800 bg-rose-950 text-rose-100' : 'border-emerald-700 bg-emerald-950 text-emerald-100'}`}>
        {toast.error ? <AlertCircle size={18} className="shrink-0" /> : <Check size={18} className="shrink-0 text-emerald-300" />}
        <span className="leading-6">{toast.text}</span>
        <button type="button" aria-label="بستن اعلان" onClick={() => setToast(null)} className="rounded-md p-1 opacity-60 hover:opacity-100 focus-visible:outline-2"><X size={14} /></button>
      </div>, document.body
    )}
  </>;
}

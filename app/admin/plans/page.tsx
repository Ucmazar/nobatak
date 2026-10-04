'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { SubscriptionPlan } from '@/types/database';

type PlanCode = 'free' | 'growth' | 'custom';
type Limits = { max_businesses: number | null; max_services: number; max_staff: number; max_daily_appointments: number; advanced_scheduling: boolean; work_shifts_enabled: boolean; max_work_shifts: number; telegram_notifications: boolean };
type Payload = { plans: SubscriptionPlan[]; setupRequired?: boolean };
const labels: Record<PlanCode, { title: string; description: string }> = {
  free: { title: 'آغاز', description: 'قالب پایه و رایگان برای شروع کسب‌وکار.' },
  growth: { title: 'رشد', description: 'قالب رشد؛ محدودیت شیفت برای هر کسب‌وکار جداگانه محاسبه می‌شود.' },
  custom: { title: 'سفارشی', description: 'این‌ها فقط مقدارهای اولیه‌اند؛ تنظیمات نهایی هنگام اعمال روی هر صاحب حساب در «اشتراک و پرداخت» تعیین می‌شود.' },
};
const defaults: Record<PlanCode, Limits> = {
  free: { max_businesses: 1, max_services: 3, max_staff: 1, max_daily_appointments: 10, advanced_scheduling: false, work_shifts_enabled: false, max_work_shifts: 0, telegram_notifications: false },
  growth: { max_businesses: 1, max_services: 20, max_staff: 10, max_daily_appointments: 100, advanced_scheduling: true, work_shifts_enabled: true, max_work_shifts: 2, telegram_notifications: true },
  custom: { max_businesses: 1, max_services: 3, max_staff: 1, max_daily_appointments: 10, advanced_scheduling: true, work_shifts_enabled: true, max_work_shifts: 2, telegram_notifications: true },
};

function limitsOf(plan: SubscriptionPlan): Limits { return { ...defaults[plan.code as PlanCode], ...(plan.limits as Record<string, unknown>) } as Limits; }

function PlanCard({ plan, onSaved }: { plan: SubscriptionPlan; onSaved: (plan: SubscriptionPlan) => void }) {
  const code = plan.code as PlanCode; const [limits, setLimits] = useState(() => limitsOf(plan)); const [amount, setAmount] = useState(String(plan.default_amount ?? '')); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  const number = (key: keyof Limits, raw: string) => { const value = Number(raw); if (Number.isSafeInteger(value) && value >= 0 && value <= 1000000) setLimits(previous => ({ ...previous, [key]: value })); };
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(''); const response = await fetch('/api/admin/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'plan-template', code, amount: amount === '' ? null : Number(amount), currency: plan.currency, durationMonths: plan.duration_months, limits }) }); const body = await response.json(); if (!response.ok) setMessage(body.error || 'ذخیره انجام نشد.'); else { onSaved(body.plan); setMessage('قالب پلن ذخیره شد؛ اشتراک صاحبان حساب تغییر نکرد.'); } setSaving(false); }
  return <form onSubmit={save} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white">
    <h2 className="text-xl font-black">{labels[code].title}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{labels[code].description}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input label="مبلغ پیش‌فرض" type="number" min="0" value={amount} onChange={event => setAmount(event.target.value)} /><Input label="حد کسب‌وکار" type="number" min="0" value={limits.max_businesses ?? ''} onChange={event => number('max_businesses', event.target.value)} /></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><Input label="خدمت برای هر کسب‌وکار" type="number" min="0" value={limits.max_services} onChange={event => number('max_services', event.target.value)} /><Input label="کارمند برای هر کسب‌وکار" type="number" min="0" value={limits.max_staff} onChange={event => number('max_staff', event.target.value)} /><Input label="نوبت روزانه" type="number" min="0" value={limits.max_daily_appointments} onChange={event => number('max_daily_appointments', event.target.value)} /></div>
    <div className="mt-4 space-y-3 rounded-xl bg-slate-950/50 p-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={limits.advanced_scheduling} onChange={event => setLimits(previous => ({ ...previous, advanced_scheduling: event.target.checked }))} />تنظیمات پیشرفته فعال باشد</label><label className="flex items-center gap-2"><input type="checkbox" checked={limits.work_shifts_enabled} onChange={event => setLimits(previous => ({ ...previous, work_shifts_enabled: event.target.checked, max_work_shifts: event.target.checked ? previous.max_work_shifts : 0 }))} />شیفت کاری فعال باشد</label><Input label="حد شیفت برای هر کسب‌وکار" type="number" min="0" disabled={!limits.work_shifts_enabled} value={limits.max_work_shifts} onChange={event => number('max_work_shifts', event.target.value)} /><label className="flex items-center gap-2"><input type="checkbox" checked={limits.telegram_notifications} onChange={event => setLimits(previous => ({ ...previous, telegram_notifications: event.target.checked }))} />اطلاع‌رسانی تلگرام</label></div>
    {message && <p role="status" className="mt-3 text-xs text-cyan-200">{message}</p>}<Button type="submit" className="mt-4" isLoading={saving}>ذخیره قالب {labels[code].title}</Button>
  </form>;
}

export default function PlansPage() {
  const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/admin/subscriptions', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) setError(body.error || 'دریافت قالب‌ها انجام نشد.'); else setData(body); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const plans = (data?.plans ?? []).filter(plan => ['free', 'growth', 'custom'].includes(plan.code));
  return <section dir="rtl" className="space-y-5"><div><h1 className="text-2xl font-black text-white">مدیریت پلن‌ها</h1><p className="mt-2 text-sm leading-7 text-slate-400">تعریف امکانات و محدودیت‌های قالب پلن‌ها. اعمال واقعی پلن روی هر صاحب حساب فقط در بخش «اشتراک و پرداخت» انجام می‌شود.</p></div>{error && <p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-rose-200">{error}</p>}{data?.setupRequired && <p role="alert" className="rounded-xl bg-amber-500/10 p-4 text-amber-100">ابتدا فایل supabase/manual_subscriptions.sql را اجرا کنید؛ ویرایش قالب‌ها تا آن زمان غیرفعال است.</p>}{!data && !error && <p className="text-slate-400">در حال دریافت قالب‌ها…</p>}<div className="grid gap-4 xl:grid-cols-3">{plans.map(plan => <PlanCard key={plan.code} plan={plan} onSaved={saved => setData(previous => previous ? { ...previous, plans: previous.plans.map(item => item.code === saved.code ? saved : item) } : previous)} />)}</div></section>;
}

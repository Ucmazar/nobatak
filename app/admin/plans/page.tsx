'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePendingActions } from '@/lib/use-pending-actions';
import { Button } from '@/components/ui/Button';
import { getKabulTodayISO, isoToAfghaniDate } from '@/lib/afghaniMonths';

type Limits = { businesses: number; services: number; staff: number; daily: number };
type PlanCode = 'free' | 'growth' | 'custom';
type Account = {
  id: string;
  full_name: string | null;
  plan_code?: PlanCode | 'legacy';
  plan_expires_on?: string | null;
  is_active?: boolean;
  max_businesses?: number | null;
  max_services_per_business?: number;
  max_staff_per_business?: number;
  max_daily_appointments_per_business?: number;
};

const defaults: Limits = { businesses: 1, services: 3, staff: 1, daily: 10 };
const nextMonth = () => { const date = new Date(`${getKabulTodayISO()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 30); return date.toISOString().slice(0, 10); };
const limitsFor = (account: Account): Limits => ({
  businesses: account.max_businesses ?? defaults.businesses,
  services: account.max_services_per_business ?? defaults.services,
  staff: account.max_staff_per_business ?? defaults.staff,
  daily: account.max_daily_appointments_per_business ?? defaults.daily,
});

function AccountLimits({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [limits, setLimits] = useState(() => limitsFor(account));
  const [plan, setPlan] = useState<PlanCode>(account.plan_code === 'growth' ? 'growth' : account.plan_code === 'custom' ? 'custom' : 'free');
  const [expiresOn, setExpiresOn] = useState(account.plan_expires_on || nextMonth());
  const [message, setMessage] = useState('');
  const { runAction, isPending } = usePendingActions();
  const pending = isPending(account.id);
  const expired = Boolean(account.plan_expires_on && account.plan_expires_on < getKabulTodayISO());

  function change(key: keyof Limits, raw: string) {
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value >= 0 && value <= 1000000) setLimits(previous => ({ ...previous, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await runAction(account.id, async () => {
      setMessage('');
      if (plan !== 'free' && (!expiresOn || expiresOn < getKabulTodayISO())) { setMessage('تاریخ پایان پلن باید امروز یا بعد از امروز باشد.'); return; }
      const selectedLimits = plan === 'custom' ? limits : defaults;
      const { error } = await supabase.rpc('set_user_plan', {
        p_user: account.id,
        p_plan: plan,
        p_businesses: selectedLimits.businesses,
        p_services: selectedLimits.services,
        p_staff: selectedLimits.staff,
        p_daily_appointments: selectedLimits.daily,
        p_expires_on: plan === 'free' ? null : expiresOn,
      });
      if (error) {
        setMessage(error.message.includes('PLAN_NOT_AUTHORIZED') ? 'فقط مدیر فعال سیستم می‌تواند این پلن را تغییر دهد.' : error.message.includes('INVALID_PLAN') ? 'پلن یا مقادیر معتبر نیستند.' : 'ذخیره انجام نشد؛ فایل جدید plan_feature_access.sql را در Supabase اجرا کنید.');
        return;
      }
      setLimits(selectedLimits);
      onSaved({ ...account, plan_code: plan, plan_expires_on: plan === 'free' ? null : expiresOn, max_businesses: selectedLimits.businesses, max_services_per_business: selectedLimits.services, max_staff_per_business: selectedLimits.staff, max_daily_appointments_per_business: selectedLimits.daily });
      setMessage(plan === 'growth' ? 'پلن رشد فعال شد.' : plan === 'custom' ? 'پلن سفارشی فعال شد.' : 'پلن آغاز فعال و پلن رشد غیرفعال شد.');
    });
  }

  const fields: Array<[keyof Limits, string]> = [['businesses', 'کسب‌وکار'], ['services', 'خدمت برای هر کسب‌وکار'], ['staff', 'کارمند برای هر کسب‌وکار'], ['daily', 'نوبت روزانه برای هر کسب‌وکار']];
  return <form onSubmit={save} className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold">{account.full_name || 'کاربر بدون نام'}</h2><p className="mt-1 text-sm text-slate-600">{account.plan_code === 'growth' ? 'پلن رشد' : account.plan_code === 'custom' ? 'پلن سفارشی' : account.plan_code === 'free' ? 'پلن آغاز · رایگان' : 'تنظیمات قبلی'}{expired ? ' · منقضی‌شده' : ''}{account.is_active === false ? ' · حساب غیرفعال' : ''}</p>{account.plan_expires_on && <p className="mt-1 text-xs text-slate-500">پایان فعلی: {isoToAfghaniDate(account.plan_expires_on)}</p>}</div>
      <Button type="submit" isLoading={pending}>{expired && account.plan_code === plan ? `تمدید پلن ${plan === 'growth' ? 'رشد' : 'سفارشی'}` : plan === 'growth' ? 'فعال‌کردن پلن رشد' : plan === 'custom' ? 'فعال‌کردن پلن سفارشی' : 'فعال‌کردن پلن آغاز'}</Button>
    </div>
    <fieldset disabled={pending} className="mt-5"><legend className="mb-2 text-sm font-bold">پلن حساب</legend><div className="grid gap-2 sm:grid-cols-3">
      {([['free', 'آغاز · رایگان'], ['growth', 'رشد · ۳۰۰ افغانی'], ['custom', 'سفارشی · توافقی']] as const).map(([code, label]) => <label key={code} className={`cursor-pointer rounded-xl border p-3 text-sm font-semibold ${plan === code ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-300'}`}><input type="radio" name={`plan-${account.id}`} value={code} checked={plan === code} onChange={() => setPlan(code)} className="ml-2" />{label}</label>)}
    </div></fieldset>
    {plan !== 'free' && <label className="mt-4 block max-w-xs text-xs font-semibold text-slate-700">تاریخ پایان پلن<input aria-label="تاریخ پایان پلن" type="date" min={getKabulTodayISO()} required disabled={pending} value={expiresOn} onChange={event => setExpiresOn(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 disabled:opacity-60" /></label>}
    {plan === 'custom' && <><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map(([key, label]) => <label key={key} className="text-xs font-semibold text-slate-700">{label}<input aria-label={label} type="number" min="0" max="1000000" step="1" required disabled={pending} value={limits[key]} onChange={event => change(key, event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 disabled:opacity-60" /></label>)}
    </div><p className="mt-3 text-xs leading-6 text-slate-500">صفر یعنی ایجاد مورد تازه در همان بخش متوقف شود. موارد موجود خودکار حذف یا غیرفعال نمی‌شوند.</p></>}
    {message && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">{message}</p>}
  </form>;
}

export default function PlansPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('با حساب فهیم ادمین وارد شوید.');
        const { data: admin, error: authError } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).single();
        if (authError || admin?.role !== 'superadmin' || admin.is_active === false) throw new Error('این بخش فقط برای مدیر فعال سیستم است.');
        const { data, error } = await supabase.from('profiles').select('id,full_name,plan_code,plan_expires_on,is_active,max_businesses,max_services_per_business,max_staff_per_business,max_daily_appointments_per_business').eq('role', 'user').order('created_at', { ascending: false });
        if (error) throw new Error(error.message.includes('max_services_per_business') ? 'ابتدا فایل جدید supabase/free_plan.sql را در دیتابیس اجرا کنید.' : 'دریافت حساب‌ها انجام نشد؛ صفحه را دوباره باز کنید.');
        if (!disposed) { setAccounts(data || []); setReady(true); }
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد.'); }
    }
    void load();
    return () => { disposed = true; };
  }, []);

  return <section dir="rtl" className="space-y-6">
    <div><h1 className="text-2xl font-bold">مدیریت پلن مشتری‌ها</h1><p className="mt-3 leading-8">برای هر صاحب کسب‌وکار پلن آغاز، رشد یا سفارشی را انتخاب و دکمهٔ فعال‌سازی را بزنید. انتخاب «آغاز» پلن رشد را غیرفعال می‌کند.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{['۱ کسب‌وکار', '۳ خدمت فعال', '۱ کارمند فعال', '۱۰ نوبت روزانه'].map(label => <div key={label} className="rounded-xl border border-slate-300 bg-white p-5 font-bold text-slate-900">{label}</div>)}</div>
    <p className="leading-8">سقف نوبت برای مجموع هر کسب‌وکار در هر تاریخ است. نوبت لغوشده ظرفیت را آزاد می‌کند؛ نوبت انجام‌شده شمرده می‌شود.</p>
    {message && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">{message}</p>}
    {!ready && !message && <p role="status">در حال دریافت حساب‌ها…</p>}
    {ready && <><label className="block">جستجوی نام<input value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label><div className="space-y-4">{accounts.filter(account => (account.full_name || '').includes(search.trim())).map(account => <AccountLimits key={account.id} account={account} onSaved={saved => setAccounts(previous => previous.map(item => item.id === saved.id ? saved : item))} />)}</div>{accounts.length === 0 && <p>هنوز حسابی ثبت نشده است.</p>}</>}
  </section>;
}

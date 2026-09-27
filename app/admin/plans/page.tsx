'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePendingActions } from '@/lib/use-pending-actions';
import { Button } from '@/components/ui/Button';

type Limits = { businesses: number; services: number; staff: number; daily: number };
type Account = {
  id: string;
  full_name: string | null;
  plan_code?: 'free' | 'custom' | 'legacy';
  is_active?: boolean;
  max_businesses?: number | null;
  max_services_per_business?: number;
  max_staff_per_business?: number;
  max_daily_appointments_per_business?: number;
};

const defaults: Limits = { businesses: 1, services: 3, staff: 1, daily: 10 };
const limitsFor = (account: Account): Limits => ({
  businesses: account.max_businesses ?? defaults.businesses,
  services: account.max_services_per_business ?? defaults.services,
  staff: account.max_staff_per_business ?? defaults.staff,
  daily: account.max_daily_appointments_per_business ?? defaults.daily,
});

function AccountLimits({ account, onSaved }: { account: Account; onSaved: (account: Account) => void }) {
  const [limits, setLimits] = useState(() => limitsFor(account));
  const [message, setMessage] = useState('');
  const { runAction, isPending } = usePendingActions();
  const pending = isPending(account.id);

  function change(key: keyof Limits, raw: string) {
    const value = Number(raw);
    if (Number.isSafeInteger(value) && value >= 0 && value <= 1000000) setLimits(previous => ({ ...previous, [key]: value }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await runAction(account.id, async () => {
      setMessage('');
      const { error } = await supabase.rpc('set_user_plan_limits', {
        p_user: account.id,
        p_businesses: limits.businesses,
        p_services: limits.services,
        p_staff: limits.staff,
        p_daily_appointments: limits.daily,
      });
      if (error) {
        setMessage(error.message.includes('PLAN_NOT_AUTHORIZED') ? 'فقط مدیر فعال سیستم می‌تواند این مقادیر را تغییر دهد.' : error.message.includes('INVALID_PLAN') ? 'مقادیر معتبر نیستند.' : 'ذخیره انجام نشد؛ فایل جدید free_plan.sql را در Supabase اجرا کنید.');
        return;
      }
      const free = limits.businesses === 1 && limits.services === 3 && limits.staff === 1 && limits.daily === 10;
      onSaved({ ...account, plan_code: free ? 'free' : 'custom', max_businesses: limits.businesses, max_services_per_business: limits.services, max_staff_per_business: limits.staff, max_daily_appointments_per_business: limits.daily });
      setMessage(free ? 'پلن رایگان ذخیره شد.' : 'پلن سفارشی ذخیره شد.');
    });
  }

  const fields: Array<[keyof Limits, string]> = [['businesses', 'کسب‌وکار'], ['services', 'خدمت برای هر کسب‌وکار'], ['staff', 'کارمند برای هر کسب‌وکار'], ['daily', 'نوبت روزانه برای هر کسب‌وکار']];
  return <form onSubmit={save} className="rounded-2xl border border-slate-300 bg-white p-5 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold">{account.full_name || 'کاربر بدون نام'}</h2><p className="mt-1 text-sm text-slate-600">{account.plan_code === 'custom' ? 'پلن سفارشی' : account.plan_code === 'free' ? 'پلن آغاز · رایگان' : 'تنظیمات قبلی'}{account.is_active === false ? ' · حساب غیرفعال' : ''}</p></div>
      <Button type="submit" isLoading={pending}>ذخیره محدودیت‌ها</Button>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map(([key, label]) => <label key={key} className="text-xs font-semibold text-slate-700">{label}<input aria-label={label} type="number" min="0" max="1000000" step="1" required disabled={pending} value={limits[key]} onChange={event => change(key, event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 disabled:opacity-60" /></label>)}
    </div>
    <p className="mt-3 text-xs leading-6 text-slate-500">صفر یعنی ایجاد مورد تازه در همان بخش متوقف شود. موارد موجود خودکار حذف یا غیرفعال نمی‌شوند.</p>
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
        const { data, error } = await supabase.from('profiles').select('id,full_name,plan_code,is_active,max_businesses,max_services_per_business,max_staff_per_business,max_daily_appointments_per_business').eq('role', 'user').order('created_at', { ascending: false });
        if (error) throw new Error(error.message.includes('max_services_per_business') ? 'ابتدا فایل جدید supabase/free_plan.sql را در دیتابیس اجرا کنید.' : 'دریافت حساب‌ها انجام نشد؛ صفحه را دوباره باز کنید.');
        if (!disposed) { setAccounts(data || []); setReady(true); }
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد.'); }
    }
    void load();
    return () => { disposed = true; };
  }, []);

  return <section dir="rtl" className="space-y-6">
    <div><h1 className="text-2xl font-bold">مدیریت پلن مشتری‌ها</h1><p className="mt-3 leading-8">مقادیر پیش‌فرض رایگان ۱ کسب‌وکار، ۳ خدمت، ۱ کارمند و ۱۰ نوبت روزانه است. هر تغییر، حساب را خودکار به پلن «سفارشی» تبدیل می‌کند.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{['۱ کسب‌وکار', '۳ خدمت فعال', '۱ کارمند فعال', '۱۰ نوبت روزانه'].map(label => <div key={label} className="rounded-xl border border-slate-300 bg-white p-5 font-bold text-slate-900">{label}</div>)}</div>
    <p className="leading-8">سقف نوبت برای مجموع هر کسب‌وکار در هر تاریخ است. نوبت لغوشده ظرفیت را آزاد می‌کند؛ نوبت انجام‌شده شمرده می‌شود.</p>
    {message && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">{message}</p>}
    {!ready && !message && <p role="status">در حال دریافت حساب‌ها…</p>}
    {ready && <><label className="block">جستجوی نام<input value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label><div className="space-y-4">{accounts.filter(account => (account.full_name || '').includes(search.trim())).map(account => <AccountLimits key={account.id} account={account} onSaved={saved => setAccounts(previous => previous.map(item => item.id === saved.id ? saved : item))} />)}</div>{accounts.length === 0 && <p>هنوز حسابی ثبت نشده است.</p>}</>}
  </section>;
}

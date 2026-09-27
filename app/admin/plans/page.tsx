'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { usePendingActions } from '@/lib/use-pending-actions';
import { Button } from '@/components/ui/Button';

type Account = { id: string; full_name: string | null; plan_code?: string; is_active?: boolean };

export default function PlansPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const { runAction, isPending } = usePendingActions();
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('با حساب فهیم ادمین وارد شوید.');
        const { data: admin, error: authError } = await supabase.from('profiles').select('role,is_active').eq('id', user.id).single();
        if (authError || admin?.role !== 'superadmin' || admin.is_active === false) throw new Error('این بخش فقط برای مدیر فعال سیستم است.');
        const { data, error } = await supabase.from('profiles').select('id,full_name,plan_code,is_active').eq('role', 'user').order('created_at', { ascending: false });
        if (error) throw new Error(error.message.includes('plan_code') ? 'ابتدا فایل supabase/free_plan.sql را در دیتابیس اجرا کنید.' : 'دریافت حساب‌ها انجام نشد؛ صفحه را دوباره باز کنید.');
        if (!disposed) { setAccounts(data || []); setReady(true); }
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'ارتباط برقرار نشد.'); }
    }
    void load();
    return () => { disposed = true; };
  }, []);

  async function assign(id: string) {
    await runAction(id, async () => {
      setMessage('');
      try {
        const { error } = await supabase.rpc('assign_free_plan', { p_user: id });
        if (error) throw error;
        setAccounts(previous => previous.map(account => account.id === id ? { ...account, plan_code: 'free' } : account));
        setMessage('پلن رایگان ذخیره شد.');
      } catch (error) {
        const code = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
        setMessage(code.includes('EXISTING_') ? 'این حساب بیش از سقف رایگان کسب‌وکار، خدمت یا کارمند فعال دارد. ابتدا موارد اضافی را از بخش مربوط مدیریت کنید؛ هیچ اطلاعاتی خودکار حذف نمی‌شود.' : code.includes('NOT_AUTHORIZED') ? 'فقط مدیر فعال سیستم می‌تواند پلن را تغییر دهد.' : 'ذخیره انجام نشد. اتصال و نصب فایل free_plan.sql را بررسی کنید.');
      }
    });
  }

  return <section dir="rtl" className="space-y-6">
    <div><h1 className="text-2xl font-bold">مدیریت پلن رایگان «آغاز»</h1><p className="mt-3 leading-8">پلن پیش‌فرض حساب‌های جدید؛ بدون هزینه و بدون تاریخ انقضا.</p></div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{['۱ کسب‌وکار', '۳ خدمت فعال', '۱ کارمند فعال', '۱۰ نوبت روزانه'].map(label => <div key={label} className="rounded-xl border border-slate-300 bg-white p-5 font-bold text-slate-900">{label}</div>)}</div>
    <p className="leading-8">۱۰ نوبت برای مجموع کسب‌وکار در هر تاریخ است؛ سقف کارمند نمی‌تواند آن را افزایش دهد. نوبت لغوشده ظرفیت را آزاد می‌کند؛ نوبت انجام‌شده همچنان شمرده می‌شود.</p>
    <p className="leading-8">حساب‌های قدیمی که بالاتر از این سقف بودند، با عنوان «تنظیمات قبلی» حفظ شده‌اند. پلن‌های رشد و همراه هنوز فعال نشده‌اند.</p>
    {message && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">{message}</p>}
    {!ready && !message && <p role="status">در حال دریافت حساب‌ها…</p>}
    {ready && <><label className="block">جستجوی نام<input value={search} onChange={e => setSearch(e.target.value)} className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label><div className="space-y-3">{accounts.filter(account => (account.full_name || '').includes(search.trim())).map(account => <article key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-900"><div><h2 className="font-bold">{account.full_name || 'کاربر بدون نام'}</h2><p className="mt-2 text-sm">{account.plan_code === 'free' ? 'آغاز · رایگان' : 'تنظیمات قبلی'}{account.is_active === false ? ' · حساب غیرفعال' : ''}</p></div>{account.plan_code !== 'free' && <Button onClick={() => void assign(account.id)} isLoading={isPending(account.id)}>اعمال پلن رایگان</Button>}</article>)}</div>{accounts.length === 0 && <p>هنوز حسابی ثبت نشده است.</p>}</>}
  </section>;
}

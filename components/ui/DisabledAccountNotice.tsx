'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DashboardAccess, BlockingBusiness } from '@/lib/dashboard-access';
import { AdminLogoutButton } from './AdminLogoutButton';
import { ArrowLeft, ShieldCheck, LockKeyhole, RefreshCw, WifiOff, Building2, CircleHelp } from 'lucide-react';
import styles from './DisabledAccountNotice.module.css';

export function DisabledAccountNotice({ initialAccess, initialBlockingBusinesses = [] }: { initialAccess: DashboardAccess; initialBlockingBusinesses?: BlockingBusiness[] }) {
  const [access, setAccess] = useState<DashboardAccess>(initialAccess);
  const [blockingBusinesses, setBlockingBusinesses] = useState(initialBlockingBusinesses);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const controller = new AbortController();
    async function check() {
      if (disposed || pending) return;
      pending = true;
      try {
        const response = await fetch('/api/dashboard-access', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (disposed) return;
        const next = response.ok ? data.access : 'unavailable';
        setAccess(next);
        setBlockingBusinesses(data.blockingBusinesses ?? []);
        if (next === 'allowed') window.location.replace('/dashboard');
        if (next === 'admin') window.location.replace('/admin');
        if (next === 'login') window.location.replace('/login');
      } catch { if (!disposed) setAccess('unavailable'); }
      finally { pending = false; }
    }
    void check();
    const timer = window.setInterval(() => { void check(); }, 3000);
    const refresh = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const unavailable = access === 'unavailable';
  const businessDisabled = access === 'business_disabled';
  return <main dir="rtl" className={styles.page}>
    <div aria-hidden="true" className={styles.ambient} />
    <header className={styles.topbar}>
      <span className={styles.brandMark}><span /> نوبتک، همراه کسب‌وکار شما</span>
      <Link href="/">صفحهٔ اصلی <ArrowLeft size={16} /></Link>
    </header>
    <section className={styles.card} aria-labelledby="access-title">
      <div className={styles.content}>
        {/* The original PNG brand asset; no replacement or recreation of the logo. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-transparent.png" width="1024" height="558" alt="نوبتک، سیستم مدیریت نوبت" className={styles.logo} />
        <span className={styles.status}><span />{unavailable ? 'در انتظار اتصال' : 'دسترسی موقتاً غیرفعال است'}</span>
        <h1 id="access-title">{unavailable ? 'اتصال را دوباره بررسی کنیم' : businessDisabled ? 'کسب‌وکار شما غیرفعال است' : 'حساب شما غیرفعال است'}</h1>
        <p role="status" aria-live="polite" className={styles.description}>{unavailable
          ? 'در حال حاضر امکان بررسی دسترسی وجود ندارد. لطفاً اتصال اینترنت خود را بررسی کنید؛ ما دوباره تلاش می‌کنیم.'
          : businessDisabled
            ? 'حساب کاربری شما فعال است، اما یک یا چند کسب‌وکار شما هنوز غیرفعال است. برای بازگشت به داشبورد، فعال‌سازی کسب‌وکارها توسط مدیر سیستم لازم است.'
            : 'دسترسی حساب شما توسط مدیر سیستم غیرفعال شده است. برای بازگشت به داشبورد، لطفاً از مدیر بخواهید حساب شما را دوباره فعال کند.'}</p>
        {businessDisabled && blockingBusinesses.length > 0 && <div className={styles.help}>
          <Building2 size={21} aria-hidden="true" />
          <div><strong>کسب‌وکارهای مانع ورود به داشبورد</strong>
            <ul>{blockingBusinesses.map(business => <li key={business.id} className="text-xs leading-7">{business.name} <span dir="ltr">({business.slug})</span></li>)}</ul>
          </div>
        </div>}
        <div className={styles.help}>
          <CircleHelp size={21} aria-hidden="true" />
          <div><strong>{unavailable ? 'نیازی به ورود دوباره نیست' : 'برای ادامه چه کاری انجام دهم؟'}</strong>
            <p>{unavailable ? 'این صفحه وضعیت اتصال را خودکار بررسی می‌کند.' : businessDisabled ? 'از مدیر بخواهید وضعیت شما را در «مدیریت کسب‌وکارها» بررسی کند.' : 'از مدیر بخواهید وضعیت شما را در «مدیریت کاربران» بررسی کند.'}</p>
          </div>
        </div>
        <div className={styles.actions}>
          <a href="/dashboard" className={styles.primary}><RefreshCw size={17} /> بررسی دوبارهٔ دسترسی</a>
          <AdminLogoutButton variant="light" />
        </div>
        <div className={styles.live}><span className={styles.liveDot} /><span>بررسی خودکار فعال است؛ پس از فعال‌سازی، به داشبورد برمی‌گردید.</span></div>
      </div>
      <aside className={styles.visual} aria-hidden="true">
        <div className={styles.visualTop}><ShieldCheck size={19} /><span>فضایی امن برای مدیریت شما</span></div>
        <div className={styles.art}>
          <div className={styles.orbitOne} /><div className={styles.orbitTwo} />
          <div className={styles.dotOne} /><div className={styles.dotTwo} />
          <div className={styles.miniCard}><Building2 size={20} /><span>داشبورد کسب‌وکار</span><span className={styles.miniLine} /></div>
          <div className={styles.shield}>{unavailable ? <WifiOff size={56} strokeWidth={1.4} /> : <LockKeyhole size={56} strokeWidth={1.4} />}</div>
          <div className={styles.floatingLabel}><span /> در انتظار {unavailable ? 'اتصال' : 'فعال‌سازی'}</div>
        </div>
        <div className={styles.visualText}><span>یک مکث کوتاه</span><h2>به‌زودی، دوباره در کنار شما</h2><p>پس از تأیید دسترسی، مدیریت نوبت‌ها را<br />از همین‌جا ادامه دهید.</p></div>
        <div className={styles.visualFooter}><span /> NOBATAK <span /></div>
      </aside>
    </section>
    <footer className={styles.footer}>نوبتک <span>•</span> مدیریت ساده‌تر، تجربه‌ای بهتر</footer>
  </main>;
}

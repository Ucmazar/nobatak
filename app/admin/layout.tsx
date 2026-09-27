import Image from 'next/image';
import { ReactNode } from 'react';
import { NavigationLink as Link } from '@/components/ui/NavigationLink';
import { AdminLogoutButton } from '@/components/ui/AdminLogoutButton';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-app min-h-screen text-slate-100 font-sans dir-rtl" dir="rtl">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo-transparent.png" width={184} height={100} sizes="(max-width: 640px) 92px, 184px" alt="نوبتک" className="h-10 w-auto object-contain " />
            </Link>
            <div>
              <span className="font-bold text-lg text-white">نوبتک</span>
              <span className="mr-2 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                مدیر
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 space-x-reverse">
            <span className="hidden sm:inline text-sm text-slate-400">
              حساب کاربری: <strong className="text-slate-200">فهیم الله خان</strong>
            </span>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <nav className="admin-navigation" aria-label="بخش‌های مدیریت"><Link href="/admin">نمای کلی و حساب‌ها</Link><Link href="/admin/plans">مدیریت پلن‌ها</Link><Link href="/admin/telegram">تنظیمات تلگرام</Link><Link href="/">مشاهدهٔ سایت</Link></nav>
      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

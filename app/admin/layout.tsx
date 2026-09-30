import Image from 'next/image';
import { ReactNode } from 'react';
import { NavigationLink as Link } from '@/components/ui/NavigationLink';
import { AdminLogoutButton } from '@/components/ui/AdminLogoutButton';

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="admin-app min-h-screen text-slate-100 font-sans"
      dir="rtl"
    >
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

          {/* Logo & Admin Badge */}
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/nobat-logo.png"
                width={184}
                height={100}
                sizes="(max-width: 640px) 92px, 184px"
                alt="نوبت"
                className="h-10 w-auto object-contain"
              />
            </Link>

            <div className="flex items-center">
              <span className="text-lg font-bold text-white">
                نوبت
              </span>

              <span className="mr-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                مدیر
              </span>
            </div>
          </div>

          {/* User & Logout */}
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-400 sm:inline">
              حساب کاربری:{' '}
              <strong className="text-slate-200">
                فهیم الله خان
              </strong>
            </span>

            <AdminLogoutButton />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav
        className="admin-navigation"
        aria-label="بخش‌های مدیریت"
      >
        <Link href="/admin">
          نمای کلی و حساب‌ها
        </Link>

        <Link href="/admin/plans">
          مدیریت پلن‌ها
        </Link>

        <Link href="/admin/telegram">
          تنظیمات تلگرام
        </Link>

        <Link href="/">
          مشاهدهٔ سایت
        </Link>
      </nav>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200 py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
              ن
            </div>
            <span className="text-lg font-bold text-slate-900">نوبتک</span>
            <span className="text-xs text-slate-400">| سیستم عمومی نوبت‌دهی آنلاین کسب‌وکارها</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium text-slate-500">
            <Link href="/" className="hover:text-slate-900 transition-colors">
              صفحه اصلی
            </Link>
            <Link href="/login" className="hover:text-slate-900 transition-colors">
              ورود به سیستم
            </Link>
            <Link href="/register" className="hover:text-slate-900 transition-colors">
              ثبت‌نام رایگان
            </Link>
          </div>

          <p className="text-xs text-slate-400">
            تمام حقوق برای سیستم نوبت‌دهی «نوبتک» محفوظ است.
          </p>
        </div>
      </div>
    </footer>
  );
}

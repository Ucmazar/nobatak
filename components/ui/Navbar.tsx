'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from './Button';

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <img src="/logo-transparent.png" alt="نوبتک" className="h-10 w-auto object-contain group-hover:scale-105 transition-transform duration-200" />
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <Link href="#about" className="hover:text-blue-600 transition-colors">
            نوبتک چیست؟
          </Link>
          <Link href="#features" className="hover:text-blue-600 transition-colors">
            مزایا و ویژگی‌ها
          </Link>
          <Link href="#business-types" className="hover:text-blue-600 transition-colors">
            کسب‌وکارها
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              ورود
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="primary" size="sm">
              شروع استفاده
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

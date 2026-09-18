import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/ui/Footer';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 overflow-hidden border-b border-slate-200/60 bg-gradient-to-b from-white via-slate-50 to-slate-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <Badge variant="blue" className="mb-6 px-4 py-1.5 text-xs font-medium rounded-full shadow-xs">
            ⚡ نسخه اولیه سیستم عمومی نوبت‌دهی آنلاین
          </Badge>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight max-w-4xl mx-auto">
            مدیریت آسان صف و نوبت‌دهی برای <span className="text-blue-600">هر نوع کسب‌وکار</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            نوبتک یک پلتفرم فوق‌العاده سریع، ساده و مدرن است که به کسب‌وکار شما امکان می‌دهد تا نوبت‌ها و صف مشتریان را به صورت آنلاین و بدون پیچیدگی مدیریت کنید.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-blue-600/20">
                شروع رایگان نوبتک
                <svg className="w-5 h-5 ml-1 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Button>
            </Link>
            <Link href="/login" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                ورود به حساب کاربری
              </Button>
            </Link>
          </div>

          {/* Quick URL Demo Badge */}
          <div className="mt-12 inline-flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm text-xs sm:text-sm text-slate-600">
            <span className="text-slate-400 font-mono dir-ltr">nobatak.com/</span>
            <span className="font-bold text-blue-600">your-business</span>
            <span className="bg-blue-50 text-blue-700 text-[10px] px-2 py-0.5 rounded-md font-semibold mr-1">لینک اختصاصی شما</span>
          </div>
        </div>
      </section>

      {/* "نوبتک چیست؟" Section */}
      <section id="about" className="py-16 md:py-24 bg-white border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center space-y-4">
            <Badge variant="emerald" className="px-3 py-1">آشنایی با سیستم</Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900">
              نوبتک چیست؟
            </h2>
            <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
              «نوبتک» یک زیرساخت عمومی و مستقل نوبت‌دهی است که برای تمام مشاغلی که نیازمند نوبت‌دهی، تنظیم وقت یا سرویس‌دهی نوبتی هستند طراحی شده است. از آرایشگاه‌ها و مطب‌های پزشکی گرفته تا تعمیرگاه‌ها، نانوایی‌ها و دفاتر خدمات الکترونیک؛ همه می‌توانند در چند ثانیه لینک اختصاصی خود را داشته باشند.
            </p>
          </div>
        </div>
      </section>

      {/* Main Benefits Section */}
      <section id="features" className="py-16 md:py-24 bg-slate-50 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900">
              چرا نوبتک را انتخاب کنید؟
            </h2>
            <p className="text-slate-500 text-sm sm:text-base mt-2">
              ویژگی‌های کلیدی که نوبتک را به بهترین گزینه برای کسب‌وکار شما تبدیل می‌کند
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:-translate-y-1 transition-transform duration-200">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <CardTitle>فوق‌العاده سریع و سبک</CardTitle>
              <CardDescription className="mt-2">
                بدون بارگذاری کدهای سنگین، بدون پیچیدگی و با بالاترین سرعت اجرا روی تمام گوشی‌ها و مرورگرها.
              </CardDescription>
            </Card>

            <Card className="hover:-translate-y-1 transition-transform duration-200">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <CardTitle>لینک اختصاصی کسب‌وکار شما</CardTitle>
              <CardDescription className="mt-2">
                هر کسب‌وکار آدرس منحصر‌به‌فرد خود مانند <code className="text-blue-600 bg-blue-50 px-1 rounded">nobatak.com/fahim</code> را دریافت می‌کند.
              </CardDescription>
            </Card>

            <Card className="hover:-translate-y-1 transition-transform duration-200">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <CardTitle>مخصوص موبایل (Mobile-First)</CardTitle>
              <CardDescription className="mt-2">
                طراحی کاملاً واکنش‌گرا و بهینه‌شده برای استفاده آسان مشتریان و صاحبان کسب‌وکار روی موبایل.
              </CardDescription>
            </Card>
          </div>
        </div>
      </section>

      {/* Business Categories Section */}
      <section id="business-types" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="amber" className="px-3 py-1">پشتیبانی همه‌جانبه</Badge>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 mt-2">
              مناسب برای انواع مشاغل
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { name: 'آرایشگاه و سالن زیبایی', icon: '✂️' },
              { name: 'کلینیک و مطب پزشکی', icon: '🩺' },
              { name: 'تعمیرگاه خودرو و لوازم', icon: '🔧' },
              { name: 'دفتر خدمات الکترونیک', icon: '📋' },
              { name: 'نانوایی و فروشگاه‌ها', icon: '🍞' },
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200/70 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-2 hover:bg-blue-50/50 hover:border-blue-200 transition-colors">
                <span className="text-3xl">{item.icon}</span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

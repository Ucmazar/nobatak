import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "نوبتک | سیستم هوشمند و عمومی نوبت‌دهی آنلاین",
  description: "سیستم عمومی و مدرن نوبت‌دهی آنلاین برای آرایشگاه‌ها، کلینیک‌ها، تعمیرگاه‌ها و کلیه کسب‌وکارها",
  keywords: ["نوبت‌دهی", "نوبتک", "رزرو آنلاین", "مدیریت صف", "نوبت آرایشگاه", "نوبت کلینیک"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full`}>
      <body className={`${vazirmatn.className} min-h-full flex flex-col bg-slate-50 text-slate-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}

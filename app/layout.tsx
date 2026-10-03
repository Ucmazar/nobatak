import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import "./marketing.css";
import { StorageNotice } from "@/components/marketing/StorageNotice";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "نوبت | سیستم هوشمند و عمومی نوبت‌دهی آنلاین",
  description: "سیستم عمومی و مدرن نوبت‌دهی آنلاین برای آرایشگاه‌ها، کلینیک‌ها، تعمیرگاه‌ها و کلیه کسب‌وکارها",
  keywords: ["نوبت‌دهی", "نوبت", "رزرو آنلاین", "مدیریت صف", "نوبت آرایشگاه", "نوبت کلینیک"],
  icons: {
    icon: [
      { url: "/favicon-light.svg", type: "image/svg+xml", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-dark.svg", type: "image/svg+xml", media: "(prefers-color-scheme: dark)" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
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
        <StorageNotice />
      </body>
    </html>
  );
}

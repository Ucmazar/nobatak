import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, PageIntro } from '@/components/marketing/MarketingShell';
import { faqs } from '@/lib/marketing';
export const metadata: Metadata = {title: 'پرسش‌های رایج | نوبت', description: 'پاسخ‌های کوتاه برای استفادهٔ آسان‌تر از نوبت.'};
export default function Page(){return <MarketingShell><main id="main-content"><PageIntro eyebrow="نوبت، همراه وقت شما" title="پرسش‌های رایج" description="پاسخ‌های کوتاه برای استفادهٔ آسان‌تر از نوبت."/><section className="mk-wrap mk-prose mk-faq">{faqs.map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}<p style={{marginTop:30}}>پاسخ‌تان را پیدا نکردید؟ <Link href="/contact">با ما تماس بگیرید.</Link></p></section></main></MarketingShell>}

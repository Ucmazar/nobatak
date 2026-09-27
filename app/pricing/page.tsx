import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, PageIntro } from '@/components/marketing/MarketingShell';
import { PricingCards } from '@/components/marketing/PricingCards';
import { samplePlans } from '@/lib/marketing';
export const metadata: Metadata = {title: 'یک پلن برای هر مرحله | نوبتک', description: 'این صفحه نمونهٔ پیشنهادی پلن‌هاست؛ قیمت و تقسیم امکانات هنوز نهایی نشده است.'};
export default function Page(){return <MarketingShell><main id="main-content"><PageIntro eyebrow="نوبتک، همراه وقت شما" title="یک پلن برای هر مرحله" description="این صفحه نمونهٔ پیشنهادی پلن‌هاست؛ قیمت و تقسیم امکانات هنوز نهایی نشده است."/><section className="mk-wrap mk-section"><PricingCards/></section><div className="mk-wrap mk-prose">{samplePlans.map(plan=><section id={plan.id} key={plan.id} style={{scrollMarginTop:30}}><h2>طرح {plan.name}</h2><p>{plan.caption}. این دسته‌بندی برای بررسی ساختار پلن‌هاست؛ انتخاب آن حساب شما را ارتقا نمی‌دهد و پرداختی دریافت نمی‌شود.</p><Link href="/contact">نظر یا نیازتان را دربارهٔ این طرح بفرستید</Link></section>)}<div className="mk-note">امکانات حساب فعلی با تنظیمات مدیر سیستم تعیین می‌شوند. فروش اشتراک و مدیریت پلن از پنل ادمین، مرحلهٔ بعدی توسعه است.</div></div></main></MarketingShell>}

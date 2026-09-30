'use client';
import { useState } from 'react';
import { NavigationLink as Link } from '@/components/ui/NavigationLink';
import Image from 'next/image';
import { Menu, X, ArrowUpLeft } from 'lucide-react';
const links = [['/services','خدمات'],['/pricing','پلن‌ها'],['/guide','چطور کار می‌کند؟'],['/about','دربارهٔ ما'],['/contact','ارتباط با ما']];
export function MarketingNav() {
 const [open,setOpen]=useState(false);
 return <header className="mk-nav"><div className="mk-wrap mk-nav-inner">
  <Link href="/" className="mk-logo" aria-label="نوبت؛ صفحه اصلی"><Image src="/logo-transparent.png" width={110} height={60} sizes="110px" alt="نوبت" /><span>وقت شما ارزشمند است</span></Link>
  <nav className="mk-desktop" aria-label="منوی اصلی">{links.map(([href,title])=><Link key={href} href={href}>{title}</Link>)}</nav>
  <div className="mk-nav-actions"><Link href="/login" className="mk-login">ورود</Link><Link href="/register" className="mk-btn mk-btn-small">شروع استفاده <ArrowUpLeft size={16}/></Link><button type="button" className="mk-menu" aria-label={open?'بستن منو':'بازکردن منو'} aria-expanded={open} aria-controls="marketing-menu" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div>
 </div>{open&&<nav id="marketing-menu" className="mk-mobile" aria-label="منوی موبایل">{links.map(([href,title])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{title}</Link>)}</nav>}</header>;
}

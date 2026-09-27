'use client';
import { useSyncExternalStore, useState } from 'react';
import { NavigationLink as Link } from '@/components/ui/NavigationLink';
const key='nobatak_storage_notice_v1';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener('nobatak-storage-notice',callback);return ()=>{window.removeEventListener('storage',callback);window.removeEventListener('nobatak-storage-notice',callback);};}
function snapshot(){try{return localStorage.getItem(key)==='seen';}catch{return false;}}
export function StorageNotice(){
 const acknowledged=useSyncExternalStore(subscribe,snapshot,()=>true);
 const [dismissed,setDismissed]=useState(false);
 function close(){try{localStorage.setItem(key,'seen');window.dispatchEvent(new Event('nobatak-storage-notice'));}catch{/* Session-only dismissal when storage is blocked. */}setDismissed(true);}
 if(acknowledged||dismissed)return null;
 return <aside className="mk-cookie" role="region" aria-label="اطلاعیهٔ کوکی و ذخیره‌سازی"><div><strong>یک یادداشت کوچک دربارهٔ حریم خصوصی</strong><p>برای ورود و نگهداری رسیدها از کوکی و ذخیره‌سازی مرورگر استفاده می‌کنیم. در این نسخه ابزار تبلیغاتی یا تحلیل رفتار اضافه نکرده‌ایم.</p></div><div className="mk-cookie-actions"><Link href="/cookies">جزئیات استفاده</Link><button type="button" onClick={close}>متوجه شدم</button></div></aside>;
}
export function StorageNoticeLink(){return <Link href="/cookies">کوکی و ذخیره‌سازی</Link>; }

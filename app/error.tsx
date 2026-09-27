'use client';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main dir="rtl" className="route-loading"><h1>بازکردن صفحه انجام نشد</h1><p>اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</p><button type="button" onClick={reset} className="mk-btn">تلاش دوباره</button><a href="/">بازگشت به صفحهٔ اصلی</a></main>;}

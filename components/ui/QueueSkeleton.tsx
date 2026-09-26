import Link from 'next/link';
import Image from 'next/image';

export function QueueSkeleton() {
  return <main dir="rtl" className="min-h-screen bg-slate-50">
    <header className="border-b bg-white px-6 py-3"><Link href="/"><Image src="/logo-transparent.png" width={92} height={50} alt="نوبتک" /></Link></header>
    <section className="mx-auto max-w-5xl space-y-5 p-6" aria-busy="true" aria-label="در حال دریافت اطلاعات">
      <p role="status" className="text-sm text-slate-500">در حال دریافت اطلاعات…</p>
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid grid-cols-3 gap-3">{[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />)}</div>
      <div className="h-52 animate-pulse rounded-2xl bg-slate-200" />
    </section>
  </main>;
}

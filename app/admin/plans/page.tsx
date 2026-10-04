'use client';

import { useCallback, useEffect, useState } from 'react';
import { PlanManagement } from '@/components/admin/PlanManagement';
import type { OwnerSubscription, SubscriptionPlan } from '@/types/database';

type Payload = { plans: SubscriptionPlan[]; subscriptions: OwnerSubscription[]; setupRequired?: boolean; stats: { active: number; paidAmount: number } };

export default function PlansPage() {
  const [data, setData] = useState<Payload | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/admin/subscriptions', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) setError(body.error || 'دریافت پلن‌ها انجام نشد.'); else { setData(body); setError(''); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  if (error) return <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">{error}</p>;
  if (!data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-72 animate-pulse rounded-3xl bg-slate-800" />)}</div>;
  return <div className="plans-page"><PlanManagement data={data} onReload={load} /></div>;
}

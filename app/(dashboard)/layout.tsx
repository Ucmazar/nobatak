import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDashboardAccessReport } from '@/lib/dashboard-access';
import { DashboardAccessGuard } from '@/components/ui/DashboardAccessGuard';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const report = await getDashboardAccessReport(await createSupabaseServerClient(), true);
  const access = report.access;
  if (access === 'login') redirect('/login');
  if (access === 'admin') redirect('/admin');
  if ((access === 'disabled' || access === 'business_disabled')) redirect('/account-disabled');
  return <DashboardAccessGuard initialReport={report}>{children}</DashboardAccessGuard>;
}

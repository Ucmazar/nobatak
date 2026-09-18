import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDashboardAccess } from '@/lib/dashboard-access';
import { DashboardAccessGuard } from '@/components/ui/DashboardAccessGuard';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const access = await getDashboardAccess(await createSupabaseServerClient());
  if (access === 'login') redirect('/login');
  if (access === 'admin') redirect('/admin');
  if ((access === 'disabled' || access === 'business_disabled')) redirect('/account-disabled');
  return <DashboardAccessGuard>{children}</DashboardAccessGuard>;
}

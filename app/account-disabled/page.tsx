import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDashboardAccessReport } from '@/lib/dashboard-access';
import { DisabledAccountNotice } from '@/components/ui/DisabledAccountNotice';

export default async function AccountDisabledPage() {
  const report = await getDashboardAccessReport(await createSupabaseServerClient());
  const { access } = report;
  if (access === 'allowed') redirect('/dashboard');
  if (access === 'admin') redirect('/admin');
  if (access === 'login') redirect('/login');
  return <DisabledAccountNotice initialAccess={access} initialBlockingBusinesses={report.blockingBusinesses} />;
}

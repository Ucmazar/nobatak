import type { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Profile, Business } from '@/types/database';

export type DashboardAccess = 'allowed' | 'login' | 'admin' | 'disabled' | 'business_disabled' | 'unavailable';
export type BlockingBusiness = Pick<Business, 'id' | 'name' | 'slug'>;
export interface DashboardAccessReport {
  access: DashboardAccess;
  accountId?: string;
  userIsActive?: boolean;
  blockingBusinesses: BlockingBusiness[];
  businesses?: Pick<Business, 'id' | 'name' | 'slug' | 'is_active'>[];
  maxBusinesses?: number | null;
}
type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getDashboardAccessReport(client: Client): Promise<DashboardAccessReport> {
  const report: DashboardAccessReport = { access: 'unavailable', blockingBusinesses: [] };
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return { ...report, access: 'login' };
    report.accountId = user.id;
    const { data: profile, error: profileError } = await client.from('profiles')
      .select('*').eq('id', user.id).returns<Pick<Profile, 'role' | 'is_active' | 'max_businesses'>[]>().single();
    if (profileError || !profile) return report;
    report.maxBusinesses = profile.max_businesses === undefined ? 1 : profile.max_businesses;
    report.userIsActive = profile.is_active !== false;
    if (!report.userIsActive) return { ...report, access: 'disabled' };
    if (profile.role === 'superadmin') return { ...report, access: 'admin' };
    const { data: businesses, error: businessError } = await client.from('businesses')
      .select('id, name, slug, is_active').eq('owner_id', user.id)
      .returns<Pick<Business, 'id' | 'name' | 'slug' | 'is_active'>[]>();
    if (businessError || !businesses) return report;
    report.businesses = businesses;
    return { ...report, access: 'allowed' };
  } catch { return report; }
}

export async function getDashboardAccess(client: Client): Promise<DashboardAccess> {
  return (await getDashboardAccessReport(client)).access;
}

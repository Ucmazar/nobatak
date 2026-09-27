import type { createSupabaseServerClient } from '@/lib/supabase/server';
import type { DashboardBootstrap } from '@/components/ui/DashboardBootstrap';
import type { Profile, Business } from '@/types/database';

export type DashboardAccess = 'allowed' | 'login' | 'admin' | 'disabled' | 'business_disabled' | 'unavailable';
export type BlockingBusiness = Pick<Business, 'id' | 'name' | 'slug'>;
export interface DashboardAccessReport {
  access: DashboardAccess;
  bootstrap?: DashboardBootstrap;
  accountId?: string;
  userIsActive?: boolean;
  blockingBusinesses: BlockingBusiness[];
  businesses?: Pick<Business, 'id' | 'name' | 'slug' | 'is_active'>[];
  maxBusinesses?: number | null;
}
type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getDashboardAccessReport(client: Client, includeBootstrap = false): Promise<DashboardAccessReport> {
  const report: DashboardAccessReport = { access: 'unavailable', blockingBusinesses: [] };
  try {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return { ...report, access: 'login' };
    report.accountId = user.id;
    const [profileResult,businessResult] = await Promise.all([
      client.from('profiles').select(includeBootstrap?'*':'role,is_active,max_businesses').eq('id',user.id).returns<Profile[]>().single(),
      client.from('businesses').select(includeBootstrap?'*':'id,name,slug,is_active').eq('owner_id',user.id).order('created_at',{ascending:false}).returns<Business[]>(),
    ]);
    const profile=profileResult.data, businesses=businessResult.data;
    if(profileResult.error||!profile)return report;
    report.maxBusinesses=profile.max_businesses===undefined?1:profile.max_businesses;
    report.userIsActive=profile.is_active!==false;
    if(!report.userIsActive)return {...report,access:'disabled'};
    if(profile.role==='superadmin')return {...report,access:'admin'};
    if(businessResult.error||!businesses)return report;
    if(includeBootstrap)report.bootstrap={user:{id:user.id,email:user.email,user_metadata:{full_name:user.user_metadata?.full_name}},profile,businesses};
    report.businesses = businesses.map(({id,name,slug,is_active})=>({id,name,slug,is_active}));
    return { ...report, access: 'allowed' };
  } catch { return report; }
}

export async function getDashboardAccess(client: Client): Promise<DashboardAccess> {
  return (await getDashboardAccessReport(client)).access;
}

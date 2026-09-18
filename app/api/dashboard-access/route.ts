import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getDashboardAccessReport } from '@/lib/dashboard-access';

export async function GET() {
  const report = await getDashboardAccessReport(await createSupabaseServerClient());
  return Response.json(report, { status: report.access === 'unavailable' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store, private' } });
}

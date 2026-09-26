import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { botReady, publicOrigin } from '@/lib/telegram/server';
import { notifyBusinesses } from '@/lib/telegram/notifications';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ success: false }, { status: 403 });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ success: false }, { status: 401 });
    const { id, status } = await request.json();
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !['waiting','serving','completed','cancelled'].includes(status)) return Response.json({ success: false }, { status: 400 });
    const [profileResult, appointmentResult] = await Promise.all([
      client.from('profiles').select('role,is_active').eq('id', user.id).single(),
      client.from('appointments').select('business_id,business:businesses(owner_id,is_active)').eq('id', id)
        .returns<{ business_id: string; business: { owner_id: string; is_active: boolean } }[]>().single(),
    ]);
    const profile = profileResult.data;
    const appointment = appointmentResult.data;
    if (profileResult.error || !profile || profile.is_active === false) return Response.json({ success: false }, { status: 403 });
    if (appointmentResult.error || !appointment) return Response.json({ success: false }, { status: 404 });
    const business = appointment.business;
    if (!business || business.is_active === false || (business.owner_id !== user.id && profile.role !== 'superadmin')) return Response.json({ success: false }, { status: 403 });
    const { data: updated, error } = await client.from('appointments').update({ status }).eq('id', id).select('id').single();
    if (error || !updated) return Response.json({ success: false, error: 'ذخیرهٔ وضعیت نوبت انجام نشد.' }, { status: 409 });
    // Return after the database commit; Telegram latency must not block queue controls.
    if (botReady()) {
      after(async () => {
        try {
          await notifyBusinesses([appointment.business_id], status === 'completed' ? [id] : [], publicOrigin(request.url));
        } catch {
          console.error('Telegram notification failed after appointment status update', { appointmentId: id });
        }
      });
    }
    return Response.json({ success: true, error: null });
  } catch { return Response.json({ success: false, error: 'ارتباط با سرور برقرار نشد.' }, { status: 503 }); }
}

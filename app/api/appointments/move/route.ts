import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ success: false, error: 'درخواست نامعتبر است.' }, { status: 403 });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ success: false, error: 'ابتدا وارد حساب شوید.' }, { status: 401 });
    const { id, steps } = await request.json();
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !Number.isInteger(steps) || steps < 1 || steps > 100) return Response.json({ success: false, error: 'تعداد جایگاه باید عددی بین ۱ تا ۱۰۰ باشد.' }, { status: 400 });
    const { data, error } = await client.rpc('move_appointment_back', { p_appointment: id, p_steps: steps });
    if (error) {
      const message = error.message || '';
      if (message.includes('NO_FOLLOWING_APPOINTMENT')) return Response.json({ success: false, error: 'بعد از این مشتری نوبت منتظر دیگری وجود ندارد.' }, { status: 409 });
      if (message.includes('APPOINTMENT_NOT_WAITING')) return Response.json({ success: false, error: 'فقط نوبت در انتظار قابل انتقال است.' }, { status: 409 });
      if (message.includes('NOT_AUTHORIZED')) return Response.json({ success: false, error: 'اجازه انجام این کار را ندارید.' }, { status: 403 });
      if (message.includes('PGRST202') || message.includes('move_appointment_back')) return Response.json({ success: false, error: 'کد SQL انتقال دستی هنوز در دیتابیس نصب نشده است.' }, { status: 503 });
      return Response.json({ success: false, error: 'انتقال نوبت انجام نشد.' }, { status: 500 });
    }
    const result = data as { moved?: number } | null;
    return Response.json({ success: true, moved: result?.moved ?? steps });
  } catch {
    return Response.json({ success: false, error: 'ارتباط با سرور برقرار نشد.' }, { status: 503 });
  }
}

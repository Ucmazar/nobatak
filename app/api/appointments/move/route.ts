import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyQueueMovement } from '@/lib/telegram/notifications';
import { botReady } from '@/lib/telegram/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

type QueueRow = {
  id: string;
  business_id: string;
  appointment_date: string;
  staff_id: string | null;
  status: string;
  queue_number: number;
  late_count: number;
};

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ success: false, error: 'درخواست نامعتبر است.' }, { status: 403 });
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return Response.json({ success: false, error: 'ابتدا وارد حساب شوید.' }, { status: 401 });
    const { id, steps } = await request.json();
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !Number.isInteger(steps) || steps < 1 || steps > 100) return Response.json({ success: false, error: 'تعداد جایگاه باید عددی بین ۱ تا ۱۰۰ باشد.' }, { status: 400 });
    const { data: target } = await client.from('appointments')
      .select('id,business_id,appointment_date,staff_id,status,queue_number,late_count')
      .eq('id', id).returns<QueueRow[]>().maybeSingle();
    let beforeRows: QueueRow[] = [];
    if (target) {
      let beforeQuery = client.from('appointments')
        .select('id,business_id,appointment_date,staff_id,status,queue_number,late_count')
        .eq('business_id', target.business_id)
        .eq('appointment_date', target.appointment_date)
        .eq('status', 'waiting');
      beforeQuery = target.staff_id ? beforeQuery.eq('staff_id', target.staff_id) : beforeQuery.is('staff_id', null);
      const beforeResult = await beforeQuery.returns<QueueRow[]>();
      beforeRows = beforeResult.data ?? [];
    }

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
    if (botReady() && target && beforeRows.length) {
      let afterQuery = client.from('appointments')
        .select('id,business_id,appointment_date,staff_id,status,queue_number,late_count')
        .eq('business_id', target.business_id)
        .eq('appointment_date', target.appointment_date)
        .eq('status', 'waiting');
      afterQuery = target.staff_id ? afterQuery.eq('staff_id', target.staff_id) : afterQuery.is('staff_id', null);
      const afterResult = await afterQuery.returns<QueueRow[]>();
      const oldRows = new Map(beforeRows.map(row => [row.id, row]));
      const changes = (afterResult.data ?? []).flatMap(row => {
        const previous = oldRows.get(row.id);
        return previous && (previous.queue_number !== row.queue_number || previous.late_count !== row.late_count)
          ? [{ record: row, previous }]
          : [];
      });
      if (changes.length) after(async () => {
        const deliveries = await Promise.allSettled(changes.map(change => notifyQueueMovement(change.record, change.previous)));
        if (deliveries.some(delivery => delivery.status === 'rejected')) console.error('Telegram queue movement notification failed', { appointmentId: id });
      });
    }
    return Response.json({ success: true, moved: result?.moved ?? steps });
  } catch {
    return Response.json({ success: false, error: 'ارتباط با سرور برقرار نشد.' }, { status: 503 });
  }
}

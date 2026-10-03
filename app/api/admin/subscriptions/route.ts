import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Json, PaymentMethod, PaymentStatus } from '@/types/database';

async function authorizedClient() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'ابتدا وارد حساب مدیریت شوید.' }, { status: 401 }) };
  const { data: profile } = await client.from('profiles').select('role,is_active').eq('id', user.id).single();
  if (!profile || profile.role !== 'superadmin' || profile.is_active === false) {
    return { error: NextResponse.json({ error: 'این بخش فقط برای سوپرادمین فعال است.' }, { status: 403 }) };
  }
  return { client };
}

function kabulDate(value: unknown, endOfDay = false) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T${endOfDay ? '23:59:59.999' : '00:00:00'}+04:30`;
  return text;
}

export async function GET() {
  const auth = await authorizedClient();
  if ('error' in auth) return auth.error;
  const { client } = auth;
  const [businesses, subscriptions, payments, plans] = await Promise.all([
    client.from('businesses').select('id,name,slug,is_active,owner_id').order('name'),
    client.from('business_subscriptions').select('*').order('updated_at', { ascending: false }),
    client.from('subscription_payments').select('*').order('created_at', { ascending: false }),
    client.from('subscription_plan_catalog').select('*').eq('is_active', true).order('default_amount'),
  ]);
  const ownerIds = [...new Set((businesses.data ?? []).map(item => item.owner_id))];
  const owners = ownerIds.length ? await client.from('profiles').select('id,full_name,phone').in('id', ownerIds) : { data: [], error: null };
  const failure = businesses.error || subscriptions.error || payments.error || plans.error || owners.error;
  if (failure) return NextResponse.json({ error: `دریافت اطلاعات مالی انجام نشد: ${failure.message}` }, { status: 500 });
  const now = Date.now();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const active = (subscriptions.data ?? []).filter(item => item.status === 'active' && (!item.expires_at || Date.parse(item.expires_at) > now));
  const expiring = active.filter(item => item.expires_at && Date.parse(item.expires_at) <= now + 7 * 86400000);
  const expired = (subscriptions.data ?? []).filter(item => item.status === 'expired' || (item.status === 'active' && item.expires_at && Date.parse(item.expires_at) <= now));
  const paidThisMonth = (payments.data ?? []).filter(item => item.payment_status === 'paid' && item.paid_at && Date.parse(item.paid_at) >= monthStart.getTime());
  return NextResponse.json({
    businesses: (businesses.data ?? []).map(item => ({ ...item, profiles: owners.data?.find(owner => owner.id === item.owner_id) ?? null })),
    subscriptions: subscriptions.data ?? [], payments: payments.data ?? [], plans: plans.data ?? [],
    stats: { active: active.length, expiring: expiring.length, expired: expired.length, paidCount: paidThisMonth.length,
      paidAmount: paidThisMonth.reduce((sum, item) => sum + Number(item.amount), 0) },
  });
}

export async function POST(request: Request) {
  const auth = await authorizedClient();
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'درخواست معتبر نیست.' }, { status: 400 });
  if (body.action === 'payment') {
    const amount = Number(body.amount);
    const duration = body.durationMonths === null || body.durationMonths === '' ? null : Number(body.durationMonths);
    if (!body.businessId || !body.planCode || !Number.isFinite(amount) || amount < 0 || !body.startAt) {
      return NextResponse.json({ error: 'کسب‌وکار، پلن، مبلغ و تاریخ شروع الزامی است.' }, { status: 400 });
    }
    const { data, error } = await auth.client.rpc('record_manual_subscription_payment', {
      p_business: String(body.businessId), p_plan: String(body.planCode), p_amount: amount,
      p_currency: String(body.currency || 'AFN').toUpperCase(), p_method: String(body.method || 'cash') as PaymentMethod,
      p_custom_method: body.customMethod ? String(body.customMethod) : null, p_status: String(body.status || 'paid') as PaymentStatus,
      p_paid_at: kabulDate(body.paidAt), p_start_at: kabulDate(body.startAt)!,
      p_duration_months: duration, p_custom_end_at: kabulDate(body.customEndAt, true),
      p_reference: body.reference ? String(body.reference) : null, p_note: body.note ? String(body.note) : null,
      p_custom_limits: (body.customLimits && typeof body.customLimits === 'object' ? body.customLimits : {}) as Json,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, paymentId: data });
  }
  if (body.action === 'status') {
    if (!body.businessId || !['active', 'suspended', 'cancelled'].includes(String(body.status))) return NextResponse.json({ error: 'وضعیت معتبر نیست.' }, { status: 400 });
    const { error } = await auth.client.rpc('set_business_subscription_status', { p_business: String(body.businessId), p_status: String(body.status) as 'active' | 'suspended' | 'cancelled', p_reason: body.reason ? String(body.reason) : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'عملیات ناشناخته است.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const auth = await authorizedClient();
  if ('error' in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.paymentId) return NextResponse.json({ error: 'شناسهٔ پرداخت لازم است.' }, { status: 400 });
  const { error } = await auth.client.rpc('update_manual_payment', {
    p_payment: String(body.paymentId), p_method: String(body.method || 'cash') as PaymentMethod,
    p_custom_method: body.customMethod ? String(body.customMethod) : null, p_reference: body.reference ? String(body.reference) : null,
    p_note: body.note ? String(body.note) : null, p_status: String(body.status || 'pending') as PaymentStatus,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Json, PaymentMethod, PaymentStatus } from '@/types/database';

async function authorizedClient() {
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'ابتدا وارد حساب مدیریت شوید.' }, { status: 401 }) };
  const { data: profile } = await client.from('profiles').select('role,is_active').eq('id', user.id).single();
  if (!profile || profile.role !== 'superadmin' || profile.is_active === false) return { error: NextResponse.json({ error: 'این بخش فقط برای سوپرادمین فعال است.' }, { status: 403 }) };
  return { client };
}
function kabulDate(value: unknown, end = false) { if (!value) return null; const text = String(value); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T${end ? '23:59:59.999' : '00:00:00'}+04:30` : text; }
const schemaMissing = (error: { code?: string; message?: string } | null) => Boolean(error && (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('schema cache')));
const fallbackPlans = [
  { code: 'free', name: 'آغاز (رایگان)', default_amount: 0, currency: 'AFN', duration_months: null, limits: { max_businesses: 1 }, is_active: true },
  { code: 'growth', name: 'رشد', default_amount: 490, currency: 'AFN', duration_months: 1, limits: { max_businesses: 1 }, is_active: true },
  { code: 'companion', name: 'همراه', default_amount: null, currency: 'AFN', duration_months: 1, limits: { max_businesses: 3 }, is_active: true },
  { code: 'custom', name: 'اختصاصی', default_amount: null, currency: 'AFN', duration_months: null, limits: {}, is_active: true },
];

export async function GET() {
  const auth = await authorizedClient(); if ('error' in auth) return auth.error; const { client } = auth;
  const [owners, businesses, subscriptions, payments, plans, conflicts] = await Promise.all([
    client.from('profiles').select('id,full_name,phone,is_active,created_at,plan_code,plan_expires_on,max_businesses').neq('role', 'superadmin').order('created_at', { ascending: false }),
    client.from('businesses').select('id,name,slug,is_active,owner_id').order('name'),
    client.from('owner_subscriptions').select('*').order('updated_at', { ascending: false }),
    client.from('subscription_payments').select('*').order('created_at', { ascending: false }),
    client.from('subscription_plan_catalog').select('*').eq('is_active', true).order('default_amount'),
    client.from('subscription_migration_conflicts').select('owner_id,reason,legacy_subscription_ids').is('resolved_at', null),
  ]);
  const setupRequired = schemaMissing(subscriptions.error) || schemaMissing(payments.error) || schemaMissing(plans.error) || schemaMissing(conflicts.error);
  const failure = owners.error || businesses.error || (!schemaMissing(subscriptions.error) && subscriptions.error) || (!schemaMissing(payments.error) && payments.error) || (!schemaMissing(plans.error) && plans.error) || (!schemaMissing(conflicts.error) && conflicts.error);
  if (failure) return NextResponse.json({ error: `دریافت اطلاعات مالی انجام نشد: ${failure.message}` }, { status: 500 });
  const emails = new Map<string, string>(); const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (url && key) { const admin = createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); for (const user of result.data.users) if (user.email) emails.set(user.id, user.email); }
  const ownerRows = (owners.data ?? []).map(owner => ({ ...owner, email: emails.get(owner.id) ?? null, businesses: (businesses.data ?? []).filter(item => item.owner_id === owner.id) }));
  const fallbackSubscriptions = setupRequired ? ownerRows.map(owner => ({ id: `legacy-${owner.id}`, owner_id: owner.id, plan_code: owner.plan_code || 'free', status: owner.plan_expires_on && Date.parse(`${owner.plan_expires_on}T23:59:59+04:30`) <= Date.now() ? 'expired' : 'active', started_at: owner.created_at, expires_at: owner.plan_expires_on ? `${owner.plan_expires_on}T23:59:59+04:30` : null, custom_limits: { max_businesses: owner.max_businesses ?? 1 }, status_reason: null, created_at: owner.created_at, updated_at: owner.created_at })) : [];
  const subscriptionRows = setupRequired ? fallbackSubscriptions : (subscriptions.data ?? []);
  const paymentRows = setupRequired ? [] : (payments.data ?? []);
  const planRows = setupRequired ? fallbackPlans : (plans.data ?? []);
  const now = Date.now(); const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const active = subscriptionRows.filter(item => item.status === 'active' && (!item.expires_at || Date.parse(item.expires_at) > now));
  const expiring = active.filter(item => item.expires_at && Date.parse(item.expires_at) <= now + 7 * 86400000);
  const expired = subscriptionRows.filter(item => item.status === 'expired' || (item.status === 'active' && item.expires_at && Date.parse(item.expires_at) <= now));
  const paid = paymentRows.filter(item => item.payment_status === 'paid' && item.paid_at && Date.parse(item.paid_at) >= monthStart.getTime());
  return NextResponse.json({ owners: ownerRows, subscriptions: subscriptionRows, payments: paymentRows, plans: planRows, conflicts: setupRequired ? [] : (conflicts.data ?? []), setupRequired, stats: { active: active.length, expiring: expiring.length, expired: expired.length, paidCount: paid.length, paidAmount: paid.reduce((sum, item) => sum + Number(item.amount), 0) } });
}

export async function POST(request: Request) {
  const auth = await authorizedClient(); if ('error' in auth) return auth.error; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'درخواست معتبر نیست.' }, { status: 400 });
  if (body.action === 'payment') {
    const amount = Number(body.amount); const duration = body.durationMonths === null || body.durationMonths === '' ? null : Number(body.durationMonths);
    if (!body.ownerId || !body.planCode || !Number.isFinite(amount) || amount < 0 || !body.startAt) return NextResponse.json({ error: 'صاحب حساب، پلن، مبلغ و تاریخ شروع الزامی است.' }, { status: 400 });
    const { data, error } = await auth.client.rpc('record_manual_subscription_payment', {
      p_owner: String(body.ownerId), p_plan: String(body.planCode), p_amount: amount, p_currency: String(body.currency || 'AFN').toUpperCase(), p_method: String(body.method || 'cash') as PaymentMethod,
      p_custom_method: body.customMethod ? String(body.customMethod) : null, p_status: String(body.status || 'paid') as PaymentStatus, p_paid_at: kabulDate(body.paidAt), p_start_at: kabulDate(body.startAt)!,
      p_duration_months: duration, p_custom_end_at: kabulDate(body.customEndAt, true), p_reference: body.reference ? String(body.reference) : null, p_note: body.note ? String(body.note) : null,
      p_custom_limits: (body.customLimits && typeof body.customLimits === 'object' ? body.customLimits : {}) as Json,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ success: true, paymentId: data });
  }
  if (body.action === 'status') {
    if (!body.ownerId || !['active', 'suspended', 'cancelled'].includes(String(body.status))) return NextResponse.json({ error: 'وضعیت معتبر نیست.' }, { status: 400 });
    const { error } = await auth.client.rpc('set_owner_subscription_status', { p_owner: String(body.ownerId), p_status: String(body.status) as 'active' | 'suspended' | 'cancelled', p_reason: body.reason ? String(body.reason) : null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ success: true });
  }
  return NextResponse.json({ error: 'عملیات ناشناخته است.' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const auth = await authorizedClient(); if ('error' in auth) return auth.error; const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body?.paymentId) return NextResponse.json({ error: 'شناسهٔ پرداخت لازم است.' }, { status: 400 });
  const { error } = await auth.client.rpc('update_manual_payment', { p_payment: String(body.paymentId), p_method: String(body.method || 'cash') as PaymentMethod, p_custom_method: body.customMethod ? String(body.customMethod) : null, p_reference: body.reference ? String(body.reference) : null, p_note: body.note ? String(body.note) : null, p_status: String(body.status || 'pending') as PaymentStatus });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ success: true });
}

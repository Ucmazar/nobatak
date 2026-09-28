import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isValidUUID } from '@/lib/utils';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: targetUserId } = await context.params;
  if (!isValidUUID(targetUserId)) return NextResponse.json({ error: 'شناسهٔ کاربر معتبر نیست.' }, { status: 400 });

  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'ابتدا وارد حساب مدیریت شوید.' }, { status: 401 });
  if (user.id === targetUserId) return NextResponse.json({ error: 'مدیر نمی‌تواند حساب خودش را حذف کند.' }, { status: 400 });

  const [{ data: adminProfile }, { data: targetProfile, error: targetError }] = await Promise.all([
    client.from('profiles').select('role,is_active').eq('id', user.id).single(),
    client.from('profiles').select('id,role,full_name').eq('id', targetUserId).single(),
  ]);
  if (!adminProfile || adminProfile.role !== 'superadmin' || adminProfile.is_active === false) {
    return NextResponse.json({ error: 'دسترسی حذف کاربر فقط برای فهیم ادمین مجاز است.' }, { status: 403 });
  }
  if (targetError || !targetProfile) return NextResponse.json({ error: 'کاربر موردنظر پیدا نشد.' }, { status: 404 });
  if (targetProfile.role === 'superadmin') return NextResponse.json({ error: 'حساب مدیر اصلی قابل حذف نیست.' }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'کلید مدیریتی Supabase در سرور تنظیم نشده است.' }, { status: 503 });
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    console.error('Admin user deletion failed:', deleteError.message);
    return NextResponse.json({ error: 'حذف حساب از Supabase انجام نشد. تنظیمات و وابستگی‌های حساب را بررسی کنید.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

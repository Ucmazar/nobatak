-- ================================================================
-- نوبتک (Nobatak) — Complete Super Admin Migration & User Active Check
-- این اسکریپت را در Supabase SQL Editor اجرا کنید
-- ================================================================

-- ۱. ایجاد ستون role در جدول profiles (در صورت عدم وجود)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- ۲. ایجاد ستون is_active در جدول profiles (در صورت عدم وجود)
-- کاربر غیرفعال (is_active=false) دسترسی به داشبورد و امکانات سیستم را ندارد
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ۳. ایجاد ستون is_active در جدول businesses (در صورت عدم وجود)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ۴. تابع بررسی superadmin — برای استفاده در RLS
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'superadmin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ۵. تابع بررسی فعال بودن کاربر جاری — برای استفاده در RLS
CREATE OR REPLACE FUNCTION public.is_user_active()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ۶. RLS Policies برای Super Admin روی جدول profiles
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
CREATE POLICY "Superadmin can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_superadmin() OR auth.uid() = id);

DROP POLICY IF EXISTS "Superadmin can update all profiles" ON public.profiles;
CREATE POLICY "Superadmin can update all profiles" ON public.profiles
  FOR UPDATE
  USING (public.is_superadmin());

-- ۷. RLS Policies برای Super Admin روی جدول businesses
DROP POLICY IF EXISTS "Superadmin can view all businesses" ON public.businesses;
CREATE POLICY "Superadmin can view all businesses" ON public.businesses
  FOR SELECT
  USING (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmin can update all businesses" ON public.businesses;
CREATE POLICY "Superadmin can update all businesses" ON public.businesses
  FOR UPDATE
  USING (public.is_superadmin());

-- ۸. به‌روزرسانی Policy عمومی کسب‌وکارها
DROP POLICY IF EXISTS "Public can view active businesses by slug" ON public.businesses;
CREATE POLICY "Public can view active businesses by slug" ON public.businesses
  FOR SELECT
  USING (
    is_active = true
    OR auth.uid() = owner_id
    OR public.is_superadmin()
  );

-- ================================================================
-- ۹. تنظیم حساب fahimadmin به عنوان Super Admin
-- لطفاً ایمیل حساب fahimadmin خود را در دستور زیر وارد کنید:
-- ================================================================

-- مثال ۱: اگر ایمیل حساب admin شما مشخص است (مثلاً fahimadmin@nobatak.com یا مشابه):
-- UPDATE public.profiles
-- SET role = 'superadmin', full_name = 'فهیم الله خان', is_active = true
-- WHERE id IN (SELECT id FROM auth.users WHERE email = 'fahimadmin@nobatak.com');


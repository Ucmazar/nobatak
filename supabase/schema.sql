-- ========================================================
-- نوبتک (Nobatak) - اسکریپت جامع پایگاه داده Supabase
-- PostgreSQL Schema + Row Level Security (RLS) + Triggers
-- ========================================================

-- ۱. جدول پروفایل کاربران (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- افزودن ستون‌های احتمالی جدید
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- ۲. جدول کسب‌وکارها (Businesses)
CREATE TABLE IF NOT EXISTS public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    slug TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS max_daily_appointments INT NOT NULL DEFAULT 20;

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON public.businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id ON public.businesses(owner_id);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their own businesses" ON public.businesses;
CREATE POLICY "Owners can view their own businesses" ON public.businesses FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Public can view active businesses by slug" ON public.businesses;
CREATE POLICY "Public can view active businesses by slug" ON public.businesses FOR SELECT USING (true);

DROP POLICY IF EXISTS "Owners can insert their own businesses" ON public.businesses;
CREATE POLICY "Owners can insert their own businesses" ON public.businesses FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can update their own businesses" ON public.businesses;
CREATE POLICY "Owners can update their own businesses" ON public.businesses FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners can delete their own businesses" ON public.businesses;
CREATE POLICY "Owners can delete their own businesses" ON public.businesses FOR DELETE USING (auth.uid() = owner_id);


-- ۳. جدول خدمات کسب‌وکار (Services)
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 15,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_business_id ON public.services(business_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage services of their businesses" ON public.services;
CREATE POLICY "Owners can manage services of their businesses" ON public.services
    FOR ALL USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Public can view active services" ON public.services;
CREATE POLICY "Public can view active services" ON public.services
    FOR SELECT USING (is_active = true);


-- ۴. جدول ارائه دهندگان خدمت / کارکنان (Staff)
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_business_id ON public.staff(business_id);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage staff of their businesses" ON public.staff;
CREATE POLICY "Owners can manage staff of their businesses" ON public.staff
    FOR ALL USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Public can view active staff" ON public.staff;
CREATE POLICY "Public can view active staff" ON public.staff
    FOR SELECT USING (is_active = true);


-- ۵. جدول نوبت‌ها (Appointments)
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    queue_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'serving', 'completed', 'cancelled')),
    estimated_wait_minutes INT NOT NULL DEFAULT 0,
    appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appointment_date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_appointments_business_id ON public.appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(business_id, appointment_date);

-- فعال‌سازی Supabase Realtime برای جدول نوبت‌ها
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage appointments of their businesses" ON public.appointments;
CREATE POLICY "Owners can manage appointments of their businesses" ON public.appointments
    FOR ALL USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = auth.uid()));

DROP POLICY IF EXISTS "Public can insert appointments" ON public.appointments;
CREATE POLICY "Public can insert appointments" ON public.appointments
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view queue status appointments" ON public.appointments;
CREATE POLICY "Public can view queue status appointments" ON public.appointments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can delete appointments" ON public.appointments;
CREATE POLICY "Public can delete appointments" ON public.appointments
    FOR DELETE USING (true);

DROP POLICY IF EXISTS "Public can update appointments" ON public.appointments;
CREATE POLICY "Public can update appointments" ON public.appointments
    FOR UPDATE USING (true);


-- ۶. تریگر ساخت خودکار پروفایل هنگام ثبت‌نام کاربر جدید
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ۷. تابع و تریگر به‌روزرسانی اتوماتیک updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_businesses_updated_at ON public.businesses;
CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_staff_updated_at ON public.staff;
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_appointments_updated_at ON public.appointments;
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();



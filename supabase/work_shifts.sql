-- Run after plan_feature_access.sql and business_working_hours.sql.
-- Adds plan-aware employee shifts and validates every new timed appointment in the database.
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS work_shifts_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_work_shifts integer;
ALTER TABLE public.profiles ALTER COLUMN max_work_shifts SET DEFAULT 0;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_max_work_shifts_valid;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_max_work_shifts_valid CHECK (max_work_shifts IS NULL OR max_work_shifts BETWEEN 0 AND 1000000);
UPDATE public.profiles SET work_shifts_enabled=false,max_work_shifts=0 WHERE plan_code='free';
UPDATE public.profiles SET work_shifts_enabled=true,max_work_shifts=2 WHERE plan_code='growth';
UPDATE public.profiles SET work_shifts_enabled=true,max_work_shifts=NULL WHERE plan_code IN ('custom','legacy') AND work_shifts_enabled=false;

CREATE TABLE IF NOT EXISTS public.work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_shifts_name_valid CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT work_shifts_time_valid CHECK (start_time <> end_time)
);
CREATE INDEX IF NOT EXISTS idx_work_shifts_business ON public.work_shifts(business_id,created_at);
CREATE INDEX IF NOT EXISTS idx_work_shifts_active_business ON public.work_shifts(business_id) WHERE is_active;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
    AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='work_shifts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.work_shifts;
  END IF;
END $$;

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.work_shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_shift_id ON public.staff(shift_id) WHERE shift_id IS NOT NULL;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appointment_time time without time zone;
CREATE INDEX IF NOT EXISTS idx_appointments_schedule ON public.appointments(business_id,appointment_date,appointment_time,staff_id);

ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their work shifts" ON public.work_shifts;
CREATE POLICY "Owners manage their work shifts" ON public.work_shifts FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.owner_id=auth.uid()))
  WITH CHECK (EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.owner_id=auth.uid()));
DROP POLICY IF EXISTS "Public reads active work shifts" ON public.work_shifts;
CREATE POLICY "Public reads active work shifts" ON public.work_shifts FOR SELECT TO anon
  USING (is_active AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.is_active IS NOT FALSE));

GRANT SELECT ON public.work_shifts TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.work_shifts TO authenticated;
GRANT ALL ON public.work_shifts TO service_role;

DROP TRIGGER IF EXISTS update_work_shifts_updated_at ON public.work_shifts;
CREATE TRIGGER update_work_shifts_updated_at BEFORE UPDATE ON public.work_shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.business_work_shift_limits(p_business uuid)
RETURNS TABLE(enabled boolean,max_shifts integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT
    CASE
      WHEN p.role='superadmin' OR p.plan_code='legacy' THEN true
      WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
        AND p.plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date THEN false
      WHEN p.plan_code='growth' THEN true
      WHEN p.plan_code='custom' THEN p.work_shifts_enabled
      ELSE false
    END,
    CASE
      WHEN p.role='superadmin' OR p.plan_code='legacy' THEN NULL
      WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
        AND p.plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date THEN 0
      WHEN p.plan_code='growth' THEN 2
      WHEN p.plan_code='custom' AND p.work_shifts_enabled THEN p.max_work_shifts
      ELSE 0
    END
  FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
  WHERE b.id=p_business AND b.is_active IS NOT FALSE AND p.is_active IS NOT FALSE;
$$;
REVOKE ALL ON FUNCTION public.business_work_shift_limits(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_work_shift_limits(uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_work_shift_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE limits record; used integer;
BEGIN
  NEW.name:=btrim(NEW.name);
  PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
  SELECT * INTO limits FROM public.business_work_shift_limits(NEW.business_id);
  IF NOT FOUND OR NOT limits.enabled THEN RAISE EXCEPTION 'WORK_SHIFTS_DISABLED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN RAISE EXCEPTION 'INVALID_WORK_SHIFT'; END IF;
    RETURN NEW;
  END IF;
  IF limits.max_shifts IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.work_shifts WHERE business_id=NEW.business_id;
    IF used>=limits.max_shifts THEN RAISE EXCEPTION 'WORK_SHIFT_LIMIT_REACHED:%',limits.max_shifts; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_work_shift_write ON public.work_shifts;
CREATE TRIGGER guard_work_shift_write BEFORE INSERT OR UPDATE ON public.work_shifts
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_shift_write();
REVOKE ALL ON FUNCTION public.guard_work_shift_write() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_staff_work_shift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE limits record;
BEGIN
  IF NEW.shift_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id AND NEW.business_id IS NOT DISTINCT FROM OLD.business_id THEN RETURN NEW; END IF;
  SELECT * INTO limits FROM public.business_work_shift_limits(NEW.business_id);
  IF NOT FOUND OR NOT limits.enabled THEN RAISE EXCEPTION 'WORK_SHIFTS_DISABLED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_shifts s WHERE s.id=NEW.shift_id AND s.business_id=NEW.business_id AND s.is_active) THEN
    RAISE EXCEPTION 'INVALID_STAFF_SHIFT' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_staff_work_shift ON public.staff;
CREATE TRIGGER guard_staff_work_shift BEFORE INSERT OR UPDATE OF shift_id,business_id ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.guard_staff_work_shift();
REVOKE ALL ON FUNCTION public.guard_staff_work_shift() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_employee_effective_working_hours(p_staff uuid,p_business uuid)
RETURNS TABLE(source text,source_name text,start_time time without time zone,end_time time without time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH limits AS (SELECT * FROM public.business_work_shift_limits(p_business)), chosen AS (
    SELECT s.shift_id,w.name,w.start_time,w.end_time,w.is_active
    FROM public.staff s LEFT JOIN public.work_shifts w ON w.id=s.shift_id AND w.business_id=s.business_id
    WHERE s.id=p_staff AND s.business_id=p_business
  )
  SELECT CASE WHEN l.enabled AND c.shift_id IS NOT NULL AND c.is_active THEN 'shift' ELSE 'business' END,
    CASE WHEN l.enabled AND c.shift_id IS NOT NULL AND c.is_active THEN c.name ELSE 'ساعت عمومی کسب‌وکار' END,
    CASE WHEN l.enabled AND c.shift_id IS NOT NULL AND c.is_active THEN c.start_time ELSE b.opening_time END,
    CASE WHEN l.enabled AND c.shift_id IS NOT NULL AND c.is_active THEN c.end_time ELSE b.closing_time END
  FROM public.businesses b CROSS JOIN limits l LEFT JOIN chosen c ON true WHERE b.id=p_business;
$$;
REVOKE ALL ON FUNCTION public.get_employee_effective_working_hours(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_effective_working_hours(uuid,uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enforce_effective_working_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE hours record;
BEGIN
  IF NEW.status NOT IN ('waiting','serving') THEN RETURN NEW; END IF;
  -- Legacy queue rows predate appointment_time; rescheduling them must remain possible.
  IF TG_OP='UPDATE' AND OLD.appointment_time IS NULL AND NEW.appointment_time IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.business_id IS NOT DISTINCT FROM OLD.business_id
    AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
    AND NEW.appointment_time IS NOT DISTINCT FROM OLD.appointment_time THEN RETURN NEW; END IF;
  IF NEW.appointment_time IS NULL THEN RAISE EXCEPTION 'APPOINTMENT_TIME_REQUIRED' USING ERRCODE='23514'; END IF;
  IF NEW.staff_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.staff s WHERE s.id=NEW.staff_id AND s.business_id=NEW.business_id AND s.is_active) THEN
    RAISE EXCEPTION 'INVALID_STAFF';
  END IF;
  SELECT * INTO hours FROM public.get_employee_effective_working_hours(NEW.staff_id,NEW.business_id);
  IF hours.start_time IS NULL OR hours.end_time IS NULL THEN RETURN NEW; END IF;
  IF hours.start_time<hours.end_time THEN
    IF NEW.appointment_time<hours.start_time OR NEW.appointment_time>=hours.end_time THEN RAISE EXCEPTION 'OUTSIDE_EFFECTIVE_WORKING_HOURS'; END IF;
  ELSIF NEW.appointment_time<hours.start_time AND NEW.appointment_time>=hours.end_time THEN
    RAISE EXCEPTION 'OUTSIDE_EFFECTIVE_WORKING_HOURS';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_effective_working_hours ON public.appointments;
CREATE TRIGGER enforce_effective_working_hours BEFORE INSERT OR UPDATE OF business_id,staff_id,appointment_date,appointment_time,status
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_effective_working_hours();
REVOKE ALL ON FUNCTION public.enforce_effective_working_hours() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_free_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE privileged boolean:=auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR public.suspension_is_admin();
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT privileged AND (NEW.plan_code<>'free' OR NEW.plan_expires_on IS NOT NULL OR NEW.max_businesses IS DISTINCT FROM 1
   OR NEW.max_services_per_business<>3 OR NEW.max_staff_per_business<>1 OR NEW.max_daily_appointments_per_business<>10
   OR NEW.work_shifts_enabled OR NEW.max_work_shifts IS DISTINCT FROM 0) THEN RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 ELSIF NOT privileged AND (NEW.plan_code IS DISTINCT FROM OLD.plan_code OR NEW.plan_expires_on IS DISTINCT FROM OLD.plan_expires_on
  OR NEW.max_businesses IS DISTINCT FROM OLD.max_businesses OR NEW.max_services_per_business IS DISTINCT FROM OLD.max_services_per_business
  OR NEW.max_staff_per_business IS DISTINCT FROM OLD.max_staff_per_business OR NEW.max_daily_appointments_per_business IS DISTINCT FROM OLD.max_daily_appointments_per_business
  OR NEW.work_shifts_enabled IS DISTINCT FROM OLD.work_shifts_enabled OR NEW.max_work_shifts IS DISTINCT FROM OLD.max_work_shifts) THEN
  RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.set_user_plan(uuid,text,integer,integer,integer,integer,date);
CREATE OR REPLACE FUNCTION public.set_user_plan(
  p_user uuid,p_plan text,p_businesses integer,p_services integer,p_staff integer,p_daily_appointments integer,p_expires_on date,
  p_work_shifts_enabled boolean,p_max_work_shifts integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE chosen_businesses integer; chosen_services integer; chosen_staff integer; chosen_daily integer; chosen_expiry date;
  chosen_shift_enabled boolean; chosen_max_shifts integer;
BEGIN
  IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_plan NOT IN ('free','growth','custom') THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
  IF p_plan<>'free' AND (p_expires_on IS NULL OR p_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date) THEN RAISE EXCEPTION 'INVALID_PLAN_EXPIRY'; END IF;
  chosen_expiry:=CASE WHEN p_plan='free' THEN NULL ELSE p_expires_on END;
  IF p_plan IN ('free','growth') THEN
    chosen_businesses:=1; chosen_services:=3; chosen_staff:=1; chosen_daily:=10;
    chosen_shift_enabled:=p_plan='growth'; chosen_max_shifts:=CASE WHEN p_plan='growth' THEN 2 ELSE 0 END;
  ELSE
    IF p_businesses IS NULL OR p_services IS NULL OR p_staff IS NULL OR p_daily_appointments IS NULL OR p_work_shifts_enabled IS NULL
      OR p_businesses<0 OR p_services<0 OR p_staff<0 OR p_daily_appointments<0
      OR p_businesses>1000000 OR p_services>1000000 OR p_staff>1000000 OR p_daily_appointments>1000000
      OR (p_work_shifts_enabled AND p_max_work_shifts IS NOT NULL AND (p_max_work_shifts<0 OR p_max_work_shifts>1000000)) THEN RAISE EXCEPTION 'INVALID_PLAN_LIMITS'; END IF;
    chosen_businesses:=p_businesses; chosen_services:=p_services; chosen_staff:=p_staff; chosen_daily:=p_daily_appointments;
    chosen_shift_enabled:=p_work_shifts_enabled; chosen_max_shifts:=CASE WHEN p_work_shifts_enabled THEN p_max_work_shifts ELSE 0 END;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND role<>'superadmin' FOR UPDATE) THEN RAISE EXCEPTION 'INVALID_PLAN_USER'; END IF;
  UPDATE public.profiles SET plan_code=p_plan,plan_expires_on=chosen_expiry,max_businesses=chosen_businesses,
    max_services_per_business=chosen_services,max_staff_per_business=chosen_staff,max_daily_appointments_per_business=chosen_daily,
    work_shifts_enabled=chosen_shift_enabled,max_work_shifts=chosen_max_shifts WHERE id=p_user;
  IF p_plan='free' THEN
    UPDATE public.staff s SET max_daily_appointments=0 FROM public.businesses b WHERE s.business_id=b.id AND b.owner_id=p_user;
    UPDATE public.business_day_closures c SET is_closed=false,reason='' FROM public.businesses b
      WHERE c.business_id=b.id AND b.owner_id=p_user AND c.booking_date >= (now() AT TIME ZONE 'Asia/Kabul')::date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_user_plan(uuid,text,integer,integer,integer,integer,date,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_plan(uuid,text,integer,integer,integer,integer,date,boolean,integer) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;

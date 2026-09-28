-- Run after free_plan.sql and booking_day_transfer.sql.
-- Adds the Growth plan and enforces its scheduling features in the database.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_code_valid;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_code_valid
  CHECK (plan_code IN ('free','growth','custom','legacy'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_on date;

CREATE OR REPLACE FUNCTION public.guard_free_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE privileged boolean:=auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR public.suspension_is_admin();
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT privileged AND (NEW.plan_code<>'free' OR NEW.plan_expires_on IS NOT NULL OR NEW.max_businesses IS DISTINCT FROM 1
   OR NEW.max_services_per_business<>3 OR NEW.max_staff_per_business<>1 OR NEW.max_daily_appointments_per_business<>10) THEN
   RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
 ELSIF NOT privileged AND (NEW.plan_code IS DISTINCT FROM OLD.plan_code OR NEW.plan_expires_on IS DISTINCT FROM OLD.plan_expires_on
  OR NEW.max_businesses IS DISTINCT FROM OLD.max_businesses OR NEW.max_services_per_business IS DISTINCT FROM OLD.max_services_per_business
  OR NEW.max_staff_per_business IS DISTINCT FROM OLD.max_staff_per_business OR NEW.max_daily_appointments_per_business IS DISTINCT FROM OLD.max_daily_appointments_per_business) THEN
  RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.business_has_advanced_scheduling(p_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
    WHERE b.id=p_business AND b.is_active IS NOT FALSE AND p.is_active IS NOT FALSE AND p.plan_code<>'free'
      AND (p.plan_expires_on IS NULL OR p.plan_expires_on >= (now() AT TIME ZONE 'Asia/Kabul')::date));
$$;

CREATE OR REPLACE FUNCTION public.plan_allows_advanced_scheduling(p_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.role()='service_role'
    OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin'))
    OR public.suspension_is_admin()
    OR (public.business_has_advanced_scheduling(p_business) AND EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=p_business AND b.owner_id=auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.plan_allows_advanced_scheduling(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_allows_advanced_scheduling(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.business_has_advanced_scheduling(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_has_advanced_scheduling(uuid) TO anon,authenticated,service_role;

DROP POLICY IF EXISTS "Read daily booking status" ON public.business_day_closures;
CREATE POLICY "Read daily booking status" ON public.business_day_closures FOR SELECT USING (
  EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.is_active IS NOT FALSE)
  AND (NOT is_closed OR public.business_has_advanced_scheduling(business_id))
);

CREATE OR REPLACE FUNCTION public.guard_plan_day_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.is_closed AND NOT public.plan_allows_advanced_scheduling(NEW.business_id) THEN
    RAISE EXCEPTION 'PLAN_FEATURE_UNAVAILABLE:day_closure' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_plan_day_closure ON public.business_day_closures;
CREATE TRIGGER guard_plan_day_closure BEFORE INSERT OR UPDATE OF is_closed,business_id
  ON public.business_day_closures FOR EACH ROW EXECUTE FUNCTION public.guard_plan_day_closure();

CREATE OR REPLACE FUNCTION public.guard_plan_staff_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.plan_allows_advanced_scheduling(NEW.business_id)
    AND NEW.max_daily_appointments IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'PLAN_FEATURE_UNAVAILABLE:staff_capacity' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

-- Free accounts use only the business-wide daily limit.
UPDATE public.staff s SET max_daily_appointments=0
FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
WHERE s.business_id=b.id AND p.plan_code='free' AND s.max_daily_appointments IS DISTINCT FROM 0;
UPDATE public.business_day_closures c SET is_closed=false,reason=''
FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
WHERE c.business_id=b.id AND p.plan_code='free' AND c.is_closed
  AND c.booking_date >= (now() AT TIME ZONE 'Asia/Kabul')::date;

DROP TRIGGER IF EXISTS guard_plan_staff_capacity ON public.staff;
CREATE TRIGGER guard_plan_staff_capacity BEFORE INSERT OR UPDATE OF business_id,max_daily_appointments
  ON public.staff FOR EACH ROW EXECUTE FUNCTION public.guard_plan_staff_capacity();

CREATE OR REPLACE FUNCTION public.business_plan_daily_quota(p_business uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p.role='superadmin' OR p.plan_code='legacy' THEN NULL
   WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
     AND p.plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date THEN 10
   ELSE p.max_daily_appointments_per_business END
 FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
 WHERE b.id=p_business AND (b.is_active OR public.suspension_is_admin() OR b.owner_id=auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_resources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code text; owner_role text; n integer; cap integer; expired boolean;
BEGIN
 IF NOT NEW.is_active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.is_active AND OLD.business_id=NEW.business_id THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role,p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
   AND p.plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date,
   CASE WHEN TG_TABLE_NAME='services' THEN p.max_services_per_business ELSE p.max_staff_per_business END
 INTO code,owner_role,expired,cap FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF expired THEN cap:=CASE WHEN TG_TABLE_NAME='services' THEN 3 ELSE 1 END; code:='free'; END IF;
 IF code NOT IN ('free','growth','custom') OR owner_role='superadmin' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='services' THEN SELECT count(*) INTO n FROM public.services WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 ELSE SELECT count(*) INTO n FROM public.staff WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id; END IF;
 IF n>=cap THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT:%',TG_TABLE_NAME; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_free_daily_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; code text; owner_role text; cap integer;
BEGIN
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'cancelled' AND OLD.business_id=NEW.business_id AND OLD.appointment_date=NEW.appointment_date THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role,CASE WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
   AND p.plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date THEN 10 ELSE p.max_daily_appointments_per_business END
 INTO code,owner_role,cap FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF code IN ('free','growth','custom') AND owner_role<>'superadmin' THEN
  SELECT count(*) INTO n FROM public.appointments WHERE business_id=NEW.business_id AND appointment_date=NEW.appointment_date AND status<>'cancelled' AND id<>NEW.id;
  IF n>=cap THEN RAISE EXCEPTION 'BUSINESS_DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_business_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed_count integer; existing_count integer; owner_role text; owner_active boolean;
BEGIN
 IF TG_OP='UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
 SELECT CASE WHEN plan_code IN ('growth','custom') AND plan_expires_on IS NOT NULL
   AND plan_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date THEN 1 ELSE max_businesses END,role,is_active
 INTO allowed_count,owner_role,owner_active FROM public.profiles WHERE id=NEW.owner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business owner does not exist' USING ERRCODE='23503'; END IF;
 IF owner_active=false AND NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'ACCOUNT_DISABLED' USING ERRCODE='42501'; END IF;
 IF owner_role='superadmin' OR allowed_count IS NULL THEN RETURN NEW; END IF;
 SELECT count(*) INTO existing_count FROM public.businesses WHERE owner_id=NEW.owner_id;
 IF existing_count>=allowed_count THEN RAISE EXCEPTION 'BUSINESS_LIMIT_REACHED: %',allowed_count USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_booking_day_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status NOT IN ('waiting','serving') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.business_id=NEW.business_id AND OLD.appointment_date=NEW.appointment_date AND OLD.status IN ('waiting','serving') THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 IF public.business_has_advanced_scheduling(NEW.business_id) AND EXISTS(SELECT 1 FROM public.business_day_closures WHERE business_id=NEW.business_id AND booking_date=NEW.appointment_date AND is_closed) THEN
  RAISE EXCEPTION 'BOOKING_CLOSED' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_daily_appointment_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE day_limit integer; booked bigint;
BEGIN
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.business_id=OLD.business_id AND NEW.appointment_date=OLD.appointment_date AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id AND OLD.status<>'cancelled' THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 IF NEW.staff_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.staff WHERE business_id=NEW.business_id AND is_active=true) THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 SELECT CASE WHEN public.business_has_advanced_scheduling(NEW.business_id) THEN max_daily_appointments ELSE 0 END INTO day_limit
   FROM public.staff WHERE id=NEW.staff_id AND business_id=NEW.business_id AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STAFF'; END IF;
 IF day_limit>0 THEN
  SELECT count(*) INTO booked FROM public.appointments WHERE business_id=NEW.business_id AND staff_id=NEW.staff_id AND appointment_date=NEW.appointment_date AND status<>'cancelled' AND id<>NEW.id;
  IF booked>=day_limit THEN RAISE EXCEPTION 'DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.set_user_plan(uuid,text,integer,integer,integer,integer);
CREATE OR REPLACE FUNCTION public.set_user_plan(
  p_user uuid,p_plan text,p_businesses integer,p_services integer,p_staff integer,p_daily_appointments integer,p_expires_on date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE chosen_businesses integer; chosen_services integer; chosen_staff integer; chosen_daily integer; chosen_expiry date;
BEGIN
  IF NOT public.suspension_is_admin() THEN
    RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_plan NOT IN ('free','growth','custom') THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
  IF p_plan<>'free' AND (p_expires_on IS NULL OR p_expires_on < (now() AT TIME ZONE 'Asia/Kabul')::date) THEN RAISE EXCEPTION 'INVALID_PLAN_EXPIRY'; END IF;
  chosen_expiry:=CASE WHEN p_plan='free' THEN NULL ELSE p_expires_on END;
  IF p_plan IN ('free','growth') THEN
    chosen_businesses:=1; chosen_services:=3; chosen_staff:=1; chosen_daily:=10;
  ELSE
    IF p_businesses IS NULL OR p_services IS NULL OR p_staff IS NULL OR p_daily_appointments IS NULL
      OR p_businesses<0 OR p_services<0 OR p_staff<0 OR p_daily_appointments<0
      OR p_businesses>1000000 OR p_services>1000000 OR p_staff>1000000 OR p_daily_appointments>1000000 THEN
      RAISE EXCEPTION 'INVALID_PLAN_LIMITS';
    END IF;
    chosen_businesses:=p_businesses; chosen_services:=p_services;
    chosen_staff:=p_staff; chosen_daily:=p_daily_appointments;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND role<>'superadmin' FOR UPDATE) THEN
    RAISE EXCEPTION 'INVALID_PLAN_USER';
  END IF;
  UPDATE public.profiles SET plan_code=p_plan,plan_expires_on=chosen_expiry,max_businesses=chosen_businesses,
    max_services_per_business=chosen_services,max_staff_per_business=chosen_staff,
    max_daily_appointments_per_business=chosen_daily WHERE id=p_user;
  IF p_plan='free' THEN
    UPDATE public.staff s SET max_daily_appointments=0
      FROM public.businesses b WHERE s.business_id=b.id AND b.owner_id=p_user;
    UPDATE public.business_day_closures c SET is_closed=false,reason=''
      FROM public.businesses b WHERE c.business_id=b.id AND b.owner_id=p_user AND c.is_closed
        AND c.booking_date >= (now() AT TIME ZONE 'Asia/Kabul')::date;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_user_plan(uuid,text,integer,integer,integer,integer,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_plan(uuid,text,integer,integer,integer,integer,date) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_plan_day_closure(),public.guard_plan_staff_capacity() FROM PUBLIC;

NOTIFY pgrst,'reload schema';
COMMIT;

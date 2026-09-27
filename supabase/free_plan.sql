-- Run after independent_access_and_limits.sql, staff_daily_capacity.sql,
-- daily_booking_control.sql and booking_day_transfer.sql. No data is deleted.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_code text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_services_per_business integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_staff_per_business integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_daily_appointments_per_business integer;

UPDATE public.profiles p SET plan_code = CASE WHEN p.role='superadmin'
 OR p.max_businesses IS DISTINCT FROM 1
 OR (SELECT count(*) FROM public.businesses b WHERE b.owner_id=p.id)>1
 OR EXISTS(SELECT 1 FROM public.businesses b WHERE b.owner_id=p.id AND (
   (SELECT count(*) FROM public.services s WHERE s.business_id=b.id AND s.is_active)>3
   OR (SELECT count(*) FROM public.staff s WHERE s.business_id=b.id AND s.is_active)>1))
 THEN 'legacy' ELSE 'free' END WHERE plan_code IS NULL;
UPDATE public.profiles SET max_services_per_business=3 WHERE max_services_per_business IS NULL;
UPDATE public.profiles SET max_staff_per_business=1 WHERE max_staff_per_business IS NULL;
UPDATE public.profiles SET max_daily_appointments_per_business=10 WHERE max_daily_appointments_per_business IS NULL;

ALTER TABLE public.profiles ALTER COLUMN plan_code SET DEFAULT 'free';
ALTER TABLE public.profiles ALTER COLUMN plan_code SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN max_services_per_business SET DEFAULT 3;
ALTER TABLE public.profiles ALTER COLUMN max_services_per_business SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN max_staff_per_business SET DEFAULT 1;
ALTER TABLE public.profiles ALTER COLUMN max_staff_per_business SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN max_daily_appointments_per_business SET DEFAULT 10;
ALTER TABLE public.profiles ALTER COLUMN max_daily_appointments_per_business SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_code_valid;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_code_valid CHECK(plan_code IN ('free','custom','legacy'));
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_service_limit_nonnegative;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_service_limit_nonnegative CHECK(max_services_per_business>=0);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_staff_limit_nonnegative;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_staff_limit_nonnegative CHECK(max_staff_per_business>=0);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_daily_limit_nonnegative;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_daily_limit_nonnegative CHECK(max_daily_appointments_per_business>=0);

CREATE OR REPLACE FUNCTION public.guard_free_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE privileged boolean:=auth.role()='service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) OR public.suspension_is_admin();
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT privileged AND (NEW.plan_code<>'free' OR NEW.max_businesses IS DISTINCT FROM 1
   OR NEW.max_services_per_business<>3 OR NEW.max_staff_per_business<>1
   OR NEW.max_daily_appointments_per_business<>10) THEN
   RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
 ELSIF NOT privileged AND (NEW.plan_code IS DISTINCT FROM OLD.plan_code
  OR NEW.max_businesses IS DISTINCT FROM OLD.max_businesses
  OR NEW.max_services_per_business IS DISTINCT FROM OLD.max_services_per_business
  OR NEW.max_staff_per_business IS DISTINCT FROM OLD.max_staff_per_business
  OR NEW.max_daily_appointments_per_business IS DISTINCT FROM OLD.max_daily_appointments_per_business) THEN
  RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_free_plan ON public.profiles;
CREATE TRIGGER guard_free_plan BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_free_plan();

CREATE OR REPLACE FUNCTION public.business_plan_daily_quota(p_business uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p.plan_code IN ('free','custom') AND p.role<>'superadmin'
  THEN p.max_daily_appointments_per_business ELSE NULL END
 FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
 WHERE b.id=p_business AND (b.is_active OR public.suspension_is_admin() OR b.owner_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.business_plan_daily_quota(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_plan_daily_quota(uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enforce_free_resources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code text; owner_role text; n integer; cap integer;
BEGIN
 IF NOT NEW.is_active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.is_active AND OLD.business_id=NEW.business_id THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role,CASE WHEN TG_TABLE_NAME='services' THEN p.max_services_per_business ELSE p.max_staff_per_business END
 INTO code,owner_role,cap FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF code NOT IN ('free','custom') OR owner_role='superadmin' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='services' THEN
  SELECT count(*) INTO n FROM public.services WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 ELSE
  SELECT count(*) INTO n FROM public.staff WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 END IF;
 IF n>=cap THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT:%',TG_TABLE_NAME; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_free_resources ON public.services;
CREATE TRIGGER enforce_free_resources BEFORE INSERT OR UPDATE OF business_id,is_active ON public.services FOR EACH ROW EXECUTE FUNCTION public.enforce_free_resources();
DROP TRIGGER IF EXISTS enforce_free_resources ON public.staff;
CREATE TRIGGER enforce_free_resources BEFORE INSERT OR UPDATE OF business_id,is_active ON public.staff FOR EACH ROW EXECUTE FUNCTION public.enforce_free_resources();

CREATE OR REPLACE FUNCTION public.enforce_free_daily_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; code text; owner_role text; cap integer;
BEGIN
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status<>'cancelled' AND OLD.business_id=NEW.business_id AND OLD.appointment_date=NEW.appointment_date THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role,p.max_daily_appointments_per_business INTO code,owner_role,cap
 FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF code IN ('free','custom') AND owner_role<>'superadmin' THEN
  SELECT count(*) INTO n FROM public.appointments WHERE business_id=NEW.business_id AND appointment_date=NEW.appointment_date AND status<>'cancelled' AND id<>NEW.id;
  IF n>=cap THEN RAISE EXCEPTION 'BUSINESS_DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_free_daily_capacity ON public.appointments;
CREATE TRIGGER enforce_free_daily_capacity BEFORE INSERT OR UPDATE OF business_id,appointment_date,status ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_free_daily_capacity();

CREATE OR REPLACE FUNCTION public.set_user_plan_limits(p_user uuid,p_businesses integer,p_services integer,p_staff integer,p_daily_appointments integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.profiles%ROWTYPE; next_code text;
BEGIN
 IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_businesses IS NULL OR p_services IS NULL OR p_staff IS NULL OR p_daily_appointments IS NULL
  OR p_businesses<0 OR p_services<0 OR p_staff<0 OR p_daily_appointments<0
  OR p_businesses>1000000 OR p_services>1000000 OR p_staff>1000000 OR p_daily_appointments>1000000 THEN
  RAISE EXCEPTION 'INVALID_PLAN_LIMITS';
 END IF;
 SELECT * INTO target FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR target.role='superadmin' THEN RAISE EXCEPTION 'INVALID_PLAN_USER'; END IF;
 next_code:=CASE WHEN p_businesses=1 AND p_services=3 AND p_staff=1 AND p_daily_appointments=10 THEN 'free' ELSE 'custom' END;
 UPDATE public.profiles SET plan_code=next_code,max_businesses=p_businesses,
  max_services_per_business=p_services,max_staff_per_business=p_staff,
  max_daily_appointments_per_business=p_daily_appointments WHERE id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.set_user_plan_limits(uuid,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_user_plan_limits(uuid,integer,integer,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_free_plan(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.set_user_plan_limits(p_user,1,3,1,10); END $$;
REVOKE ALL ON FUNCTION public.assign_free_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_free_plan(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_free_plan(),public.enforce_free_resources(),public.enforce_free_daily_capacity() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.shift_booking_group(p_business uuid,p_ids uuid[],p_target date,p_last date)
RETURNS uuid[] LANGUAGE plpgsql SET search_path='' AS $$
DECLARE target date:=p_target; g record; a public.appointments%ROWTYPE; capacity integer;
 booked bigint; fits boolean:=true; existing_ids uuid[]; moved_ids uuid[]:=ARRAY[]::uuid[]; next_number integer;
BEGIN
 IF coalesce(cardinality(p_ids),0)=0 THEN RETURN moved_ids; END IF;
 WHILE EXISTS(SELECT 1 FROM public.business_day_closures WHERE business_id=p_business AND booking_date=target AND is_closed) LOOP
  target:=target+1; IF target>p_last THEN RAISE EXCEPTION 'NO_AVAILABLE_DAY'; END IF;
 END LOOP;
 IF target>p_last THEN RAISE EXCEPTION 'NO_AVAILABLE_DAY'; END IF;
 capacity:=public.business_plan_daily_quota(p_business);
 IF capacity IS NOT NULL THEN
  SELECT count(*) INTO booked FROM public.appointments WHERE business_id=p_business AND appointment_date=target AND status<>'cancelled';
  IF cardinality(p_ids)>capacity THEN RAISE EXCEPTION 'TRANSFER_CAPACITY_CONFLICT'; END IF;
  IF booked+cardinality(p_ids)>capacity THEN fits:=false; END IF;
 END IF;
 FOR g IN SELECT staff_id,count(*) AS needed FROM public.appointments WHERE id=ANY(p_ids) AND business_id=p_business GROUP BY staff_id LOOP
  capacity:=0;
  IF g.staff_id IS NOT NULL THEN
   SELECT max_daily_appointments INTO capacity FROM public.staff WHERE id=g.staff_id AND business_id=p_business AND is_active FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STAFF'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.staff WHERE business_id=p_business AND is_active) THEN RAISE EXCEPTION 'STAFF_REQUIRED';
  END IF;
  IF capacity>0 THEN
   IF g.needed>capacity THEN RAISE EXCEPTION 'TRANSFER_CAPACITY_CONFLICT'; END IF;
   SELECT count(*) INTO booked FROM public.appointments WHERE business_id=p_business AND appointment_date=target AND staff_id IS NOT DISTINCT FROM g.staff_id AND status<>'cancelled';
   IF booked+g.needed>capacity THEN fits:=false; END IF;
  END IF;
 END LOOP;
 IF NOT fits THEN
  SELECT array_agg(id ORDER BY queue_number,created_at,id) INTO existing_ids FROM public.appointments WHERE business_id=p_business AND appointment_date=target AND status IN ('waiting','serving');
  IF coalesce(cardinality(existing_ids),0)=0 THEN RAISE EXCEPTION 'TRANSFER_CAPACITY_CONFLICT'; END IF;
  moved_ids:=public.shift_booking_group(p_business,existing_ids,target+1,p_last);
 END IF;
 FOR a IN SELECT * FROM public.appointments WHERE id=ANY(p_ids) AND business_id=p_business ORDER BY queue_number,created_at,id FOR UPDATE LOOP
  SELECT coalesce(max(queue_number),0)+1 INTO next_number FROM public.appointments WHERE business_id=p_business AND appointment_date=target;
  UPDATE public.appointments SET appointment_date=target,queue_number=next_number,status='waiting' WHERE id=a.id;
  moved_ids:=array_append(moved_ids,a.id);
 END LOOP;
 RETURN moved_ids;
END $$;
REVOKE ALL ON FUNCTION public.shift_booking_group(uuid,uuid[],date,date) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

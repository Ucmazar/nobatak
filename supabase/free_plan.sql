-- Run after independent_access_and_limits.sql, staff_daily_capacity.sql,
-- daily_booking_control.sql and booking_day_transfer.sql. No data is deleted.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_code text;
-- Preserve existing exceptions and accounts already above the free limits.
UPDATE public.profiles p SET plan_code = CASE WHEN p.role='superadmin'
 OR p.max_businesses IS DISTINCT FROM 1
 OR (SELECT count(*) FROM public.businesses b WHERE b.owner_id=p.id)>1
 OR EXISTS(SELECT 1 FROM public.businesses b WHERE b.owner_id=p.id AND (
   (SELECT count(*) FROM public.services s WHERE s.business_id=b.id AND s.is_active)>3
   OR (SELECT count(*) FROM public.staff s WHERE s.business_id=b.id AND s.is_active)>1))
 THEN 'legacy' ELSE 'free' END WHERE plan_code IS NULL;
ALTER TABLE public.profiles ALTER COLUMN plan_code SET DEFAULT 'free';
ALTER TABLE public.profiles ALTER COLUMN plan_code SET NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_plan_code_valid') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_code_valid CHECK(plan_code IN ('free','legacy'));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_free_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.plan_code<>'free' AND NOT public.suspension_is_admin()
   AND auth.role() IS DISTINCT FROM 'service_role'
   AND NOT(auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) THEN
   RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
 ELSIF NEW.plan_code IS DISTINCT FROM OLD.plan_code AND NOT public.suspension_is_admin()
  AND auth.role() IS DISTINCT FROM 'service_role'
  AND NOT(auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) THEN
  RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF NEW.plan_code='free' AND NEW.role<>'superadmin' AND NEW.max_businesses IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'FREE_PLAN_BUSINESS_LIMIT';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_free_plan ON public.profiles;
CREATE TRIGGER guard_free_plan BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_free_plan();

-- Read-only public information: no profile identifiers or private fields exposed.
CREATE OR REPLACE FUNCTION public.business_plan_daily_limit(p_business uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p.plan_code='free' AND p.role<>'superadmin' THEN 10 ELSE 0 END
 FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
 WHERE b.id=p_business AND (b.is_active OR public.suspension_is_admin() OR b.owner_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.business_plan_daily_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_plan_daily_limit(uuid) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enforce_free_resources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code text; owner_role text; n integer; cap integer;
BEGIN
 IF NOT NEW.is_active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_active AND OLD.business_id=NEW.business_id THEN RETURN NEW; END IF;
 END IF;
 -- Same lock used by booking and admin plan assignment.
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role INTO code,owner_role FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF code IS DISTINCT FROM 'free' OR owner_role='superadmin' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='services' THEN
  cap:=3; SELECT count(*) INTO n FROM public.services WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 ELSE
  cap:=1; SELECT count(*) INTO n FROM public.staff WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 END IF;
 IF n>=cap THEN RAISE EXCEPTION 'FREE_PLAN_RESOURCE_LIMIT:%',TG_TABLE_NAME; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_free_resources ON public.services;
CREATE TRIGGER enforce_free_resources BEFORE INSERT OR UPDATE OF business_id,is_active ON public.services FOR EACH ROW EXECUTE FUNCTION public.enforce_free_resources();
DROP TRIGGER IF EXISTS enforce_free_resources ON public.staff;
CREATE TRIGGER enforce_free_resources BEFORE INSERT OR UPDATE OF business_id,is_active ON public.staff FOR EACH ROW EXECUTE FUNCTION public.enforce_free_resources();

-- Additional business-wide cap; the existing staff-specific trigger remains in place.
CREATE OR REPLACE FUNCTION public.enforce_free_daily_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; code text; owner_role text;
BEGIN
 IF NEW.status='cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status<>'cancelled' AND OLD.business_id=NEW.business_id AND OLD.appointment_date=NEW.appointment_date THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.plan_code,p.role INTO code,owner_role FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF code='free' AND owner_role<>'superadmin' THEN
  SELECT count(*) INTO n FROM public.appointments WHERE business_id=NEW.business_id AND appointment_date=NEW.appointment_date AND status<>'cancelled' AND id<>NEW.id;
  IF n>=10 THEN RAISE EXCEPTION 'BUSINESS_DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_free_daily_capacity ON public.appointments;
CREATE TRIGGER enforce_free_daily_capacity BEFORE INSERT OR UPDATE OF business_id,appointment_date,status ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_free_daily_capacity();

CREATE OR REPLACE FUNCTION public.assign_free_plan(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.profiles%ROWTYPE; b record;
BEGIN
 IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'PLAN_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR target.role='superadmin' THEN RAISE EXCEPTION 'INVALID_PLAN_USER'; END IF;
 IF (SELECT count(*) FROM public.businesses WHERE owner_id=p_user)>1 THEN RAISE EXCEPTION 'FREE_PLAN_EXISTING_BUSINESSES'; END IF;
 FOR b IN SELECT id FROM public.businesses WHERE owner_id=p_user ORDER BY id FOR UPDATE LOOP
  IF (SELECT count(*) FROM public.services WHERE business_id=b.id AND is_active)>3
   OR (SELECT count(*) FROM public.staff WHERE business_id=b.id AND is_active)>1 THEN
   RAISE EXCEPTION 'FREE_PLAN_EXISTING_RESOURCES';
  END IF;
 END LOOP;
 UPDATE public.profiles SET plan_code='free',max_businesses=1 WHERE id=p_user;
END $$;
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
  target:=target+1;
  IF target>p_last THEN RAISE EXCEPTION 'NO_AVAILABLE_DAY'; END IF;
 END LOOP;
 IF target>p_last THEN RAISE EXCEPTION 'NO_AVAILABLE_DAY'; END IF;
 capacity:=public.business_plan_daily_limit(p_business);
 IF capacity>0 THEN
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
   SELECT count(*) INTO booked FROM public.appointments WHERE business_id=p_business AND appointment_date=target
    AND staff_id IS NOT DISTINCT FROM g.staff_id AND status<>'cancelled';
   IF booked+g.needed>capacity THEN fits:=false; END IF;
  END IF;
 END LOOP;
 IF NOT fits THEN
  SELECT array_agg(id ORDER BY queue_number,created_at,id) INTO existing_ids FROM public.appointments
   WHERE business_id=p_business AND appointment_date=target AND status IN ('waiting','serving');
  IF coalesce(cardinality(existing_ids),0)=0 THEN RAISE EXCEPTION 'TRANSFER_CAPACITY_CONFLICT'; END IF;
  moved_ids:=public.shift_booking_group(p_business,existing_ids,target+1,p_last);
 END IF;
 FOR a IN SELECT * FROM public.appointments WHERE id=ANY(p_ids) AND business_id=p_business ORDER BY queue_number,created_at,id FOR UPDATE LOOP
  SELECT coalesce(max(queue_number),0)+1 INTO next_number FROM public.appointments WHERE business_id=p_business AND appointment_date=target;
  -- Existing capacity/day triggers verify the final destination as well.
  UPDATE public.appointments SET appointment_date=target,queue_number=next_number,status='waiting' WHERE id=a.id;
  moved_ids:=array_append(moved_ids,a.id);
 END LOOP;
 RETURN moved_ids;
END;
$$;
REVOKE ALL ON FUNCTION public.shift_booking_group(uuid,uuid[],date,date) FROM PUBLIC,anon,authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;

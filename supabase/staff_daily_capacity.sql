BEGIN;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS max_daily_appointments integer;
UPDATE public.staff s SET max_daily_appointments = COALESCE(b.max_daily_appointments,20) FROM public.businesses b WHERE s.business_id=b.id AND s.max_daily_appointments IS NULL;
ALTER TABLE public.staff ALTER COLUMN max_daily_appointments SET DEFAULT 20;
ALTER TABLE public.staff ALTER COLUMN max_daily_appointments SET NOT NULL;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_daily_capacity_nonnegative;
ALTER TABLE public.staff ADD CONSTRAINT staff_daily_capacity_nonnegative CHECK(max_daily_appointments >= 0);
CREATE OR REPLACE FUNCTION public.enforce_daily_appointment_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE day_limit integer; booked bigint;
BEGIN
 IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.business_id=OLD.business_id AND NEW.appointment_date=OLD.appointment_date AND NEW.staff_id IS NOT DISTINCT FROM OLD.staff_id AND OLD.status <> 'cancelled' THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 IF NEW.staff_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM public.staff WHERE business_id=NEW.business_id AND is_active=true) THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  RETURN NEW;
 END IF;
 SELECT max_daily_appointments INTO day_limit FROM public.staff WHERE id=NEW.staff_id AND business_id=NEW.business_id AND is_active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STAFF'; END IF;
 IF day_limit > 0 THEN
  SELECT count(*) INTO booked FROM public.appointments WHERE business_id=NEW.business_id AND staff_id=NEW.staff_id AND appointment_date=NEW.appointment_date AND status <> 'cancelled' AND id <> NEW.id;
  IF booked >= day_limit THEN RAISE EXCEPTION 'DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_daily_appointment_capacity() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_daily_appointment_capacity ON public.appointments;
CREATE TRIGGER enforce_daily_appointment_capacity BEFORE INSERT OR UPDATE OF business_id,appointment_date,staff_id,status ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_appointment_capacity();
NOTIFY pgrst,'reload schema';
COMMIT;

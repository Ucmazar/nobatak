BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS max_daily_appointments integer NOT NULL DEFAULT 20;
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_daily_capacity_nonnegative;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_daily_capacity_nonnegative CHECK (max_daily_appointments >= 0);
CREATE OR REPLACE FUNCTION public.enforce_daily_appointment_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE day_limit integer; booked bigint;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.business_id = OLD.business_id AND NEW.appointment_date = OLD.appointment_date THEN RETURN NEW; END IF;
 END IF;
 -- Serialize inserts for this business, including simultaneous requests from different phones.
 SELECT max_daily_appointments INTO day_limit FROM public.businesses WHERE id = NEW.business_id FOR UPDATE;
 IF day_limit > 0 THEN
  SELECT count(*) INTO booked FROM public.appointments
   WHERE business_id = NEW.business_id AND appointment_date = NEW.appointment_date AND id <> NEW.id;
  IF booked >= day_limit THEN RAISE EXCEPTION 'DAILY_CAPACITY_REACHED'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_daily_appointment_capacity() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_daily_appointment_capacity ON public.appointments;
CREATE TRIGGER enforce_daily_appointment_capacity BEFORE INSERT OR UPDATE OF business_id, appointment_date ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_daily_appointment_capacity();
NOTIFY pgrst, 'reload schema';
COMMIT;

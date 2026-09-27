-- Per-browser active booking limits and duplicate active visitor-name protection.
BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS max_active_appointments_per_device integer DEFAULT 3;
ALTER TABLE public.businesses ALTER COLUMN max_active_appointments_per_device SET DEFAULT 3;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS no_show_grace_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE public.businesses ALTER COLUMN no_show_grace_minutes SET DEFAULT 5;
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_device_active_limit_valid;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_device_active_limit_valid CHECK(max_active_appointments_per_device IS NULL OR max_active_appointments_per_device>=1);
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_no_show_grace_valid;
ALTER TABLE public.businesses ADD CONSTRAINT businesses_no_show_grace_valid CHECK(no_show_grace_minutes>=0 AND no_show_grace_minutes<=120);
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS booking_device_id uuid;
CREATE INDEX IF NOT EXISTS appointments_active_device_lookup ON public.appointments(business_id,booking_device_id) WHERE status IN ('waiting','serving');

CREATE OR REPLACE FUNCTION public.normalize_booking_name(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT lower(regexp_replace(translate(trim(value),'يك','یک'),'\s+',' ','g'));
$$;

CREATE OR REPLACE FUNCTION public.enforce_device_booking_limits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allowed integer; active_count integer; normalized text;
BEGIN
 IF TG_OP='INSERT' AND auth.uid() IS NULL AND NEW.booking_device_id IS NULL THEN RAISE EXCEPTION 'BOOKING_DEVICE_REQUIRED'; END IF;
 IF NEW.status NOT IN ('waiting','serving') THEN RETURN NEW; END IF;
 SELECT max_active_appointments_per_device INTO allowed FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 IF NEW.booking_device_id IS NOT NULL AND allowed IS NOT NULL THEN
  SELECT count(*) INTO active_count FROM public.appointments WHERE business_id=NEW.business_id AND booking_device_id=NEW.booking_device_id AND status IN ('waiting','serving') AND id<>NEW.id;
  IF active_count>=allowed THEN RAISE EXCEPTION 'DEVICE_ACTIVE_LIMIT_REACHED:%',allowed; END IF;
 END IF;
 normalized:=public.normalize_booking_name(NEW.customer_name);
 IF EXISTS(SELECT 1 FROM public.appointments a WHERE a.business_id=NEW.business_id AND a.staff_id IS NOT DISTINCT FROM NEW.staff_id
  AND a.status IN ('waiting','serving') AND a.id<>NEW.id AND public.normalize_booking_name(a.customer_name)=normalized) THEN
  RAISE EXCEPTION 'DUPLICATE_ACTIVE_NAME';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_device_booking_limits ON public.appointments;
CREATE TRIGGER enforce_device_booking_limits BEFORE INSERT OR UPDATE OF business_id,staff_id,customer_name,status,booking_device_id ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.enforce_device_booking_limits();
REVOKE ALL ON FUNCTION public.enforce_device_booking_limits(),public.normalize_booking_name(text) FROM PUBLIC;
NOTIFY pgrst,'reload schema';
COMMIT;

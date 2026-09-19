-- Run once in Supabase SQL Editor. Existing non-null appointment dates are preserved.
BEGIN;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appointment_date date;
-- Legacy rows without a booking date can only be assigned their creation date.
UPDATE public.appointments SET appointment_date = (created_at AT TIME ZONE 'Asia/Kabul')::date WHERE appointment_date IS NULL;
ALTER TABLE public.appointments ALTER COLUMN appointment_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Kabul')::date);
ALTER TABLE public.appointments ALTER COLUMN appointment_date SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(business_id, appointment_date);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'appointments') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

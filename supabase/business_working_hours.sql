-- Run once in Supabase SQL Editor. Safe to run again.
BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS opening_time time without time zone;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS closing_time time without time zone;
NOTIFY pgrst, 'reload schema';
COMMIT;

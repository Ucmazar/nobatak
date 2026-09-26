-- Run the complete file in Supabase SQL Editor as postgres.
-- Cancels existing overdue active appointments immediately, then checks every minute.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE INDEX IF NOT EXISTS appointments_expiry_active_date
 ON public.appointments(appointment_date) WHERE status IN ('waiting','serving');

CREATE OR REPLACE FUNCTION public.cancel_expired_appointments()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected bigint;
BEGIN
 UPDATE public.appointments SET status='cancelled'
 WHERE appointment_date < (statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date
   AND status IN ('waiting','serving');
 GET DIAGNOSTICS affected = ROW_COUNT;
 RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_expired_appointments() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.prevent_expired_active_appointment()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('waiting','serving')
    AND NEW.appointment_date < (statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date THEN
   RAISE EXCEPTION 'APPOINTMENT_DATE_EXPIRED' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_expired_active_appointment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS prevent_expired_active_appointment ON public.appointments;
CREATE TRIGGER prevent_expired_active_appointment
 BEFORE INSERT OR UPDATE OF status,appointment_date ON public.appointments
 FOR EACH ROW EXECUTE FUNCTION public.prevent_expired_active_appointment();

-- Named schedule is updated rather than duplicated when this migration is rerun.
SELECT cron.schedule('nobatak-cancel-expired-appointments','* * * * *',
 'SELECT public.cancel_expired_appointments();');
SELECT public.cancel_expired_appointments();
NOTIFY pgrst,'reload schema';
COMMIT;

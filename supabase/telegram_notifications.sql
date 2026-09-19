BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_subscriptions (
 appointment_id uuid PRIMARY KEY REFERENCES public.appointments(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 chat_id text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 last_fingerprint text,
 pending_fingerprint text,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_subscriptions FROM anon, authenticated;
GRANT ALL ON public.telegram_subscriptions TO service_role;
CREATE INDEX IF NOT EXISTS telegram_subscriptions_chat ON public.telegram_subscriptions(chat_id);
CREATE INDEX IF NOT EXISTS telegram_subscriptions_business ON public.telegram_subscriptions(business_id) WHERE enabled;
CREATE OR REPLACE FUNCTION public.bind_telegram_ticket(p_appointment uuid, p_chat text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE linked_chat text;
BEGIN
 INSERT INTO public.telegram_subscriptions(appointment_id,business_id,chat_id)
 SELECT id,business_id,p_chat FROM public.appointments WHERE id=p_appointment AND status IN ('waiting','serving')
 ON CONFLICT (appointment_id) DO NOTHING;
 SELECT chat_id INTO linked_chat FROM public.telegram_subscriptions WHERE appointment_id=p_appointment FOR UPDATE;
 IF linked_chat IS DISTINCT FROM p_chat THEN RETURN false; END IF;
 UPDATE public.telegram_subscriptions SET enabled=true WHERE appointment_id=p_appointment;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bind_telegram_ticket(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_telegram_ticket(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_telegram_notice(p_appointment uuid,p_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.telegram_subscriptions SET pending_fingerprint=p_fingerprint,lease_until=now()+interval '90 seconds'
 WHERE appointment_id=p_appointment AND enabled AND last_fingerprint IS DISTINCT FROM p_fingerprint AND (lease_until IS NULL OR lease_until<now());
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_telegram_notice(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telegram_notice(uuid,text) TO service_role;
-- Queue numbering is assigned under the same business-row lock used by the capacity trigger.
CREATE OR REPLACE FUNCTION public.assign_booking_queue_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT coalesce(max(queue_number),0)+1 INTO NEW.queue_number FROM public.appointments
 WHERE business_id=NEW.business_id AND appointment_date=NEW.appointment_date;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_booking_queue_number() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS assign_booking_queue_number ON public.appointments;
CREATE TRIGGER assign_booking_queue_number BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.assign_booking_queue_number();
CREATE OR REPLACE FUNCTION public.nobatak_telegram_ready() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.nobatak_telegram_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nobatak_telegram_ready() TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

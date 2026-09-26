-- Requires the existing profiles/businesses/appointments and telegram_notifications migrations.
-- Run the entire file. All changes are transactional and re-runnable.
BEGIN;
CREATE TABLE IF NOT EXISTS public.business_day_closures (
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 booking_date date NOT NULL,
 is_closed boolean NOT NULL DEFAULT false,
 reason text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (business_id, booking_date),
 CHECK (NOT is_closed OR length(trim(reason)) BETWEEN 3 AND 500)
);
ALTER TABLE public.business_day_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_day_closures FROM anon, authenticated;
GRANT SELECT ON public.business_day_closures TO anon, authenticated;
DROP POLICY IF EXISTS "Read daily booking status" ON public.business_day_closures;
CREATE POLICY "Read daily booking status" ON public.business_day_closures FOR SELECT
 USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.is_active IS NOT FALSE));

CREATE TABLE IF NOT EXISTS public.daily_booking_requests (
 request_id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL,
 booking_date date NOT NULL,
 closed boolean NOT NULL,
 cancel_today boolean NOT NULL,
 reason text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_booking_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_booking_requests TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_cancellation_notices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES public.daily_booking_requests(request_id) DEFERRABLE INITIALLY DEFERRED,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 appointment_id uuid NOT NULL,
 booking_date date NOT NULL,
 chat_id text NOT NULL,
 message text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 lease_until timestamptz,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (request_id, appointment_id)
);
ALTER TABLE public.daily_cancellation_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_cancellation_notices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_cancellation_notices TO service_role;
CREATE INDEX IF NOT EXISTS daily_notices_dispatch ON public.daily_cancellation_notices(business_id,status,created_at);

CREATE OR REPLACE FUNCTION public.can_manage_booking_day(p_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.businesses b ON b.id=p_business
   WHERE p.id=auth.uid() AND p.is_active IS NOT FALSE AND b.is_active IS NOT FALSE
   AND (p.role='superadmin' OR b.owner_id=p.id)
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_booking_day(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_booking_day(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_business_day_booking(
 p_business uuid, p_closed boolean, p_reason text, p_cancel_today boolean, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 day date := (now() AT TIME ZONE 'Asia/Kabul')::date;
 explanation text := trim(coalesce(p_reason,''));
 previous public.daily_booking_requests%ROWTYPE;
 changed integer := 0;
 queued integer := 0;
 answer jsonb;
 business_name text;
BEGIN
 IF NOT public.can_manage_booking_day(p_business) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_closed IS NULL OR p_cancel_today IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF (p_closed OR p_cancel_today) AND (length(explanation)<3 OR length(explanation)>500) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 -- Same lock as queue numbering/capacity: a concurrent booking cannot slip past closure.
 SELECT name INTO business_name FROM public.businesses WHERE id=p_business FOR UPDATE;
 IF NOT public.can_manage_booking_day(p_business) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.daily_booking_requests WHERE request_id=p_request;
 IF FOUND THEN
   IF previous.business_id<>p_business OR previous.actor_id<>auth.uid() OR previous.closed<>p_closed
      OR previous.cancel_today<>p_cancel_today OR previous.reason<>explanation THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
   RETURN previous.result;
 END IF;
 INSERT INTO public.business_day_closures(business_id,booking_date,is_closed,reason)
 VALUES(p_business,day,p_closed,explanation)
 ON CONFLICT(business_id,booking_date) DO UPDATE SET is_closed=EXCLUDED.is_closed,reason=EXCLUDED.reason,updated_at=now();
 IF p_cancel_today THEN
   WITH cancelled AS (
     UPDATE public.appointments SET status='cancelled'
     WHERE business_id=p_business AND appointment_date=day AND status IN ('waiting','serving')
     RETURNING id,customer_name,queue_number
   ), notices AS (
     INSERT INTO public.daily_cancellation_notices(request_id,business_id,appointment_id,booking_date,chat_id,message)
     SELECT p_request,p_business,a.id,day,t.chat_id,
       business_name || E'\n' || a.customer_name || E'\nنوبت امروز شما لغو شد.\nشماره رسید: ' || a.queue_number::text || E'\nدلیل: ' || explanation
     FROM cancelled a JOIN public.telegram_subscriptions t ON t.appointment_id=a.id AND t.enabled
     ON CONFLICT(request_id,appointment_id) DO NOTHING RETURNING id
   ) SELECT (SELECT count(*) FROM cancelled),(SELECT count(*) FROM notices) INTO changed,queued;
 END IF;
 answer:=jsonb_build_object('date',day,'closed',p_closed,'reason',explanation,'cancelled',changed,'queued',queued,'requestId',p_request);
 INSERT INTO public.daily_booking_requests(request_id,business_id,actor_id,booking_date,closed,cancel_today,reason,result)
 VALUES(p_request,p_business,auth.uid(),day,p_closed,p_cancel_today,explanation,answer);
 RETURN answer;
END;
$$;
REVOKE ALL ON FUNCTION public.set_business_day_booking(uuid,boolean,text,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_business_day_booking(uuid,boolean,text,boolean,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_booking_day_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status NOT IN ('waiting','serving') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.business_id=NEW.business_id AND OLD.appointment_date=NEW.appointment_date AND OLD.status IN ('waiting','serving') THEN RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.business_day_closures WHERE business_id=NEW.business_id AND booking_date=NEW.appointment_date AND is_closed) THEN
   RAISE EXCEPTION 'BOOKING_CLOSED' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_booking_day_open() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS enforce_booking_day_open ON public.appointments;
CREATE TRIGGER enforce_booking_day_open BEFORE INSERT OR UPDATE OF business_id,appointment_date,status ON public.appointments
 FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_day_open();

CREATE OR REPLACE FUNCTION public.daily_notice_summary(p_business uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.can_manage_booking_day(p_business) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object(
   'pending',count(*) FILTER(WHERE status='pending'),
   'sending',count(*) FILTER(WHERE status='sending' AND lease_until>now()),
   'failed',count(*) FILTER(WHERE status='failed' OR (status='sending' AND lease_until<=now())),
   'sent',count(*) FILTER(WHERE status='sent')
 ) FROM public.daily_cancellation_notices WHERE business_id=p_business);
END;
$$;
REVOKE ALL ON FUNCTION public.daily_notice_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.daily_notice_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_daily_notices(p_business uuid,p_limit integer DEFAULT 20)
RETURNS SETOF public.daily_cancellation_notices LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.daily_cancellation_notices n SET status='sending',attempts=n.attempts+1,lease_until=now()+interval '90 seconds',last_error=NULL
 WHERE n.id IN (
   SELECT id FROM public.daily_cancellation_notices
   WHERE (p_business IS NULL OR business_id=p_business) AND (status IN ('pending','failed') OR (status='sending' AND lease_until<=now()))
   ORDER BY created_at LIMIT least(greatest(p_limit,1),20) FOR UPDATE SKIP LOCKED
 ) RETURNING n.*;
$$;
REVOKE ALL ON FUNCTION public.claim_daily_notices(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_notices(uuid,integer) TO service_role;

DO $$ DECLARE target text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   FOREACH target IN ARRAY ARRAY['appointments','businesses','profiles','business_day_closures'] LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=target) THEN
       EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',target);
     END IF;
   END LOOP;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

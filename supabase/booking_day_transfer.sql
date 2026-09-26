-- Requires daily_booking_control.sql and staff_daily_capacity.sql.
-- Run complete file as postgres. No appointments are moved by installation alone.
BEGIN;

-- Internal recursive mover. Called only while the wrapper holds the business lock.
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

CREATE OR REPLACE FUNCTION public.set_business_day_with_transfer(
 p_business uuid,p_date date,p_closed boolean,p_reason text,p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 previous public.daily_booking_requests%ROWTYPE;
 a public.appointments%ROWTYPE;
 target date;
 day_limit integer;
 booked bigint;
 next_number integer;
 moved integer:=0;
 queued integer:=0;
 notice_count integer;
 explanation text:=trim(coalesce(p_reason,''));
 business_name text;
 source_ids uuid[];
 all_moved uuid[];
 answer jsonb;
BEGIN
 IF NOT public.can_manage_booking_day(p_business) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_date IS NULL OR p_closed IS NULL OR p_request IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 IF length(explanation)>500 OR (p_closed AND length(explanation)<3) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 SELECT name INTO business_name FROM public.businesses WHERE id=p_business FOR UPDATE;
 IF NOT public.can_manage_booking_day(p_business) THEN RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.daily_booking_requests WHERE request_id=p_request;
 IF FOUND THEN
  IF previous.business_id<>p_business OR previous.actor_id<>auth.uid() OR previous.booking_date<>p_date
   OR previous.closed<>p_closed OR previous.reason<>explanation OR previous.result->>'mode' IS DISTINCT FROM 'transfer' THEN
   RAISE EXCEPTION 'REQUEST_CONFLICT';
  END IF;
  RETURN previous.result;
 END IF;
 IF p_date < (statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date THEN RAISE EXCEPTION 'PAST_DATE'; END IF;
 INSERT INTO public.business_day_closures(business_id,booking_date,is_closed,reason)
 VALUES(p_business,p_date,p_closed,explanation)
 ON CONFLICT(business_id,booking_date) DO UPDATE SET is_closed=EXCLUDED.is_closed,reason=EXCLUDED.reason,updated_at=now();
 IF p_closed THEN
  SELECT array_agg(id ORDER BY queue_number,created_at,id) INTO source_ids FROM public.appointments
   WHERE business_id=p_business AND appointment_date=p_date AND status IN ('waiting','serving');
  all_moved:=public.shift_booking_group(p_business,source_ids,p_date+1,p_date+366);
  moved:=coalesce(cardinality(all_moved),0);
  FOR a IN SELECT * FROM public.appointments WHERE id=ANY(all_moved) LOOP
   target:=a.appointment_date;
   next_number:=a.queue_number;
   INSERT INTO public.daily_cancellation_notices(request_id,business_id,appointment_id,booking_date,chat_id,message)
   SELECT p_request,p_business,a.id,p_date,t.chat_id,
    business_name || E'\n' || coalesce(a.customer_name,'') || E'\nبه دلیل بسته بودن پذیرش، نوبت شما منتقل شد.\nدلیل: ' || explanation ||
    E'\nتاریخ جدید (میلادی، به وقت کابل): ' || target::text || E'\nشماره جدید: ' || next_number::text
   FROM public.telegram_subscriptions t WHERE t.appointment_id=a.id AND t.enabled
   ON CONFLICT(request_id,appointment_id) DO NOTHING;
   GET DIAGNOSTICS notice_count=ROW_COUNT;
   queued:=queued+notice_count;
  END LOOP;
 END IF;
 answer:=jsonb_build_object('mode','transfer','date',p_date,'closed',p_closed,'reason',explanation,'moved',moved,'queued',queued,'requestId',p_request);
 INSERT INTO public.daily_booking_requests(request_id,business_id,actor_id,booking_date,closed,cancel_today,reason,result)
 VALUES(p_request,p_business,auth.uid(),p_date,p_closed,false,explanation,answer);
 RETURN answer;
END;
$$;
REVOKE ALL ON FUNCTION public.set_business_day_with_transfer(uuid,date,boolean,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_business_day_with_transfer(uuid,date,boolean,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Manual queue transfer. This replaces and removes the former automatic delay job.
-- Run this complete file once in Supabase SQL Editor as postgres.
BEGIN;

DO $$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job WHERE jobname = 'nobatak-process-late-appointments' LIMIT 1;
  IF existing_job IS NOT NULL THEN PERFORM cron.unschedule(existing_job); END IF;
EXCEPTION WHEN invalid_schema_name OR undefined_table OR undefined_function THEN NULL;
END $$;

DROP TRIGGER IF EXISTS clear_inactive_late_deadline ON public.appointments;
DROP FUNCTION IF EXISTS public.clear_inactive_late_deadline();
DROP FUNCTION IF EXISTS public.process_late_appointments(integer);
DROP INDEX IF EXISTS public.appointments_late_due;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS late_deadline_at;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS late_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_late_count_valid;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_late_count_valid CHECK (late_count >= 0);

CREATE OR REPLACE FUNCTION public.move_appointment_back(p_appointment uuid, p_steps integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target public.appointments%ROWTYPE;
  follower_ids uuid[];
  follower_numbers integer[];
  actual_steps integer;
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF p_steps IS NULL OR p_steps < 1 OR p_steps > 100 THEN RAISE EXCEPTION 'INVALID_STEPS'; END IF;
  SELECT a.* INTO target FROM public.appointments a WHERE a.id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND'; END IF;
  IF target.status <> 'waiting' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_WAITING'; END IF;
  SELECT p.role INTO caller_role FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active IS NOT FALSE;
  IF caller_role IS NULL OR (caller_role <> 'superadmin' AND NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = target.business_id AND b.owner_id = auth.uid() AND b.is_active IS NOT FALSE
  )) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  SELECT array_agg(next_row.id ORDER BY next_row.queue_number, next_row.created_at, next_row.id),
         array_agg(next_row.queue_number ORDER BY next_row.queue_number, next_row.created_at, next_row.id)
  INTO follower_ids, follower_numbers
  FROM (
    SELECT a.id, a.queue_number, a.created_at
    FROM public.appointments a
    WHERE a.business_id = target.business_id
      AND a.appointment_date = target.appointment_date
      AND a.staff_id IS NOT DISTINCT FROM target.staff_id
      AND a.status = 'waiting'
      AND (a.queue_number, a.created_at, a.id) > (target.queue_number, target.created_at, target.id)
    ORDER BY a.queue_number, a.created_at, a.id
    LIMIT p_steps
    FOR UPDATE
  ) next_row;

  actual_steps := coalesce(array_length(follower_ids, 1), 0);
  IF actual_steps = 0 THEN RAISE EXCEPTION 'NO_FOLLOWING_APPOINTMENT'; END IF;

  UPDATE public.appointments a
  SET queue_number = CASE
        WHEN a.id = target.id THEN follower_numbers[actual_steps]
        WHEN array_position(follower_ids, a.id) = 1 THEN target.queue_number
        ELSE follower_numbers[array_position(follower_ids, a.id) - 1]
      END,
      late_count = CASE WHEN a.id = target.id THEN a.late_count + actual_steps ELSE a.late_count END
  WHERE a.id = target.id OR a.id = ANY(follower_ids);

  UPDATE public.appointments current_row
  SET estimated_wait_minutes =
    coalesce((
      SELECT ceil(sum(CASE WHEN ahead.status='serving'
        THEN greatest(coalesce(s.duration_minutes,20)-extract(epoch FROM(now()-ahead.updated_at))/60.0,0)
        ELSE coalesce(s.duration_minutes,20) END))::integer FROM public.appointments ahead
      LEFT JOIN public.services s ON s.id=ahead.service_id
      WHERE ahead.business_id = current_row.business_id
        AND ahead.appointment_date = current_row.appointment_date
        AND ahead.staff_id IS NOT DISTINCT FROM current_row.staff_id
        AND ahead.status IN ('waiting', 'serving')
        AND ahead.queue_number < current_row.queue_number
    ),0)
  WHERE current_row.business_id = target.business_id
    AND current_row.appointment_date = target.appointment_date
    AND current_row.staff_id IS NOT DISTINCT FROM target.staff_id
    AND current_row.status = 'waiting';

  RETURN jsonb_build_object('moved', actual_steps, 'lateCount', target.late_count + actual_steps, 'queueNumber', follower_numbers[actual_steps]);
END;
$$;

REVOKE ALL ON FUNCTION public.move_appointment_back(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_appointment_back(uuid, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;

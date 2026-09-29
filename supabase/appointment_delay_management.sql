-- Atomic one-position delay management for independent staff queues.
-- Requires business_working_hours.sql and device_booking_limits.sql.
-- Run the complete file in Supabase SQL Editor as postgres.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS late_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS late_deadline_at timestamptz;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_late_count_valid;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_late_count_valid CHECK (late_count >= 0);
CREATE INDEX IF NOT EXISTS appointments_late_due
  ON public.appointments(late_deadline_at)
  WHERE status = 'waiting' AND late_deadline_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.clear_inactive_late_deadline()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'waiting' OR (TG_OP = 'UPDATE' AND OLD.status <> 'waiting' AND NEW.status = 'waiting') THEN
    NEW.late_deadline_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_inactive_late_deadline() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS clear_inactive_late_deadline ON public.appointments;
CREATE TRIGGER clear_inactive_late_deadline
  BEFORE INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.clear_inactive_late_deadline();

CREATE OR REPLACE FUNCTION public.process_late_appointments(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  candidate record;
  current_app public.appointments%ROWTYPE;
  next_app public.appointments%ROWTYPE;
  grace_minutes integer;
  processed integer := 0;
  current_day date := (statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date;
BEGIN
  -- Deadlines only belong to today's first waiting customer in a queue with no active service.
  UPDATE public.appointments a
  SET late_deadline_at = NULL
  WHERE a.late_deadline_at IS NOT NULL
    AND (
      a.status <> 'waiting'
      OR a.appointment_date <> current_day
      OR EXISTS (
        SELECT 1 FROM public.appointments active
        WHERE active.business_id = a.business_id
          AND active.appointment_date = a.appointment_date
          AND active.staff_id IS NOT DISTINCT FROM a.staff_id
          AND active.status = 'serving'
      )
      OR EXISTS (
        SELECT 1 FROM public.appointments earlier
        WHERE earlier.business_id = a.business_id
          AND earlier.appointment_date = a.appointment_date
          AND earlier.staff_id IS NOT DISTINCT FROM a.staff_id
          AND earlier.status = 'waiting'
          AND (earlier.queue_number, earlier.created_at, earlier.id) < (a.queue_number, a.created_at, a.id)
      )
    );

  WITH heads AS (
    SELECT DISTINCT ON (a.business_id, a.appointment_date, a.staff_id)
      a.id,
      greatest(coalesce(b.no_show_grace_minutes, 5), 0) AS grace_minutes
    FROM public.appointments a
    JOIN public.businesses b ON b.id = a.business_id
    WHERE a.status = 'waiting'
      AND a.appointment_date = current_day
      AND b.is_active IS NOT FALSE
      AND b.opening_time IS NOT NULL
      AND clock_timestamp() >= ((current_day + b.opening_time) AT TIME ZONE 'Asia/Kabul')
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments serving
        WHERE serving.business_id = a.business_id
          AND serving.appointment_date = a.appointment_date
          AND serving.staff_id IS NOT DISTINCT FROM a.staff_id
          AND serving.status = 'serving'
      )
    ORDER BY a.business_id, a.appointment_date, a.staff_id, a.queue_number, a.created_at, a.id
  )
  UPDATE public.appointments a
  SET late_deadline_at = clock_timestamp() + make_interval(mins => heads.grace_minutes)
  FROM heads
  WHERE a.id = heads.id AND a.late_deadline_at IS NULL;

  FOR candidate IN
    SELECT a.id
    FROM public.appointments a
    JOIN public.businesses b ON b.id = a.business_id
    WHERE a.status = 'waiting'
      AND a.appointment_date = current_day
      AND a.late_deadline_at IS NOT NULL
      AND a.late_deadline_at <= clock_timestamp()
      AND b.is_active IS NOT FALSE
      AND b.opening_time IS NOT NULL
      AND clock_timestamp() >= ((current_day + b.opening_time) AT TIME ZONE 'Asia/Kabul')
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments active
        WHERE active.business_id = a.business_id
          AND active.appointment_date = a.appointment_date
          AND active.staff_id IS NOT DISTINCT FROM a.staff_id
          AND active.status = 'serving'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments earlier
        WHERE earlier.business_id = a.business_id
          AND earlier.appointment_date = a.appointment_date
          AND earlier.staff_id IS NOT DISTINCT FROM a.staff_id
          AND earlier.status = 'waiting'
          AND (earlier.queue_number, earlier.created_at, earlier.id) < (a.queue_number, a.created_at, a.id)
      )
    ORDER BY a.late_deadline_at, a.id
    LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
    FOR UPDATE OF a SKIP LOCKED
  LOOP
    SELECT * INTO current_app FROM public.appointments WHERE id = candidate.id FOR UPDATE;
    IF current_app.status <> 'waiting' OR current_app.late_deadline_at IS NULL OR current_app.late_deadline_at > clock_timestamp() THEN
      CONTINUE;
    END IF;

    SELECT greatest(coalesce(no_show_grace_minutes, 5), 0)
    INTO grace_minutes
    FROM public.businesses
    WHERE id = current_app.business_id AND is_active IS NOT FALSE
    FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.appointments active
      WHERE active.business_id = current_app.business_id
        AND active.appointment_date = current_app.appointment_date
        AND active.staff_id IS NOT DISTINCT FROM current_app.staff_id
        AND active.status = 'serving'
    ) OR EXISTS (
      SELECT 1 FROM public.appointments earlier
      WHERE earlier.business_id = current_app.business_id
        AND earlier.appointment_date = current_app.appointment_date
        AND earlier.staff_id IS NOT DISTINCT FROM current_app.staff_id
        AND earlier.status = 'waiting'
        AND (earlier.queue_number, earlier.created_at, earlier.id) < (current_app.queue_number, current_app.created_at, current_app.id)
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO next_app
    FROM public.appointments a
    WHERE a.business_id = current_app.business_id
      AND a.appointment_date = current_app.appointment_date
      AND a.staff_id IS NOT DISTINCT FROM current_app.staff_id
      AND a.status = 'waiting'
      AND (a.queue_number, a.created_at, a.id) > (current_app.queue_number, current_app.created_at, current_app.id)
    ORDER BY a.queue_number, a.created_at, a.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- No follower means no real move and therefore no late-count increase.
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE public.appointments a
    SET queue_number = CASE WHEN a.id = current_app.id THEN next_app.queue_number ELSE current_app.queue_number END,
        late_count = CASE WHEN a.id = current_app.id THEN a.late_count + 1 ELSE a.late_count END,
        late_deadline_at = CASE WHEN a.id = next_app.id THEN clock_timestamp() + make_interval(mins => grace_minutes) ELSE NULL END
    WHERE a.id IN (current_app.id, next_app.id);

    -- Keep the persisted estimate aligned with the same live-position formula used by the UI.
    UPDATE public.appointments target
    SET estimated_wait_minutes =
      coalesce((SELECT s.duration_minutes FROM public.services s WHERE s.id = target.service_id), 20)
      * (
        SELECT count(*)::integer FROM public.appointments ahead
        WHERE ahead.business_id = target.business_id
          AND ahead.appointment_date = target.appointment_date
          AND ahead.staff_id IS NOT DISTINCT FROM target.staff_id
          AND ahead.status IN ('waiting', 'serving')
          AND ahead.queue_number < target.queue_number
      )
    WHERE target.business_id = current_app.business_id
      AND target.appointment_date = current_app.appointment_date
      AND target.staff_id IS NOT DISTINCT FROM current_app.staff_id
      AND target.status = 'waiting';

    processed := processed + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', processed, 'checkedAt', clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.process_late_appointments(integer) FROM PUBLIC, anon, authenticated, service_role;

-- A named job remains single when this migration is rerun.
SELECT cron.schedule(
  'nobatak-process-late-appointments',
  '* * * * *',
  'SELECT public.process_late_appointments();'
);

NOTIFY pgrst, 'reload schema';
COMMIT;

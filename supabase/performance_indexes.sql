-- Run separately, outside a transaction. CONCURRENTLY avoids blocking live bookings.
-- Existing indexes are intentionally preserved. Inspect production EXPLAIN ANALYZE
-- and index sizes before removing any overlapping old index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_day_order_idx
 ON public.appointments(business_id,appointment_date,created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_staff_capacity_idx
 ON public.appointments(business_id,appointment_date,staff_id) WHERE status<>'cancelled';
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_staff_queue_idx
 ON public.appointments(business_id,appointment_date,staff_id,queue_number) WHERE status IN ('waiting','serving');
CREATE INDEX CONCURRENTLY IF NOT EXISTS appointments_day_number_idx
 ON public.appointments(business_id,appointment_date,queue_number DESC);

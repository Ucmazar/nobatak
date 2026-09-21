BEGIN;
CREATE TABLE IF NOT EXISTS public.telegram_ticket_bundles (
 id uuid PRIMARY KEY,
 appointment_ids uuid[] NOT NULL,
 expires_at timestamptz NOT NULL,
 chat_id text,
 CONSTRAINT telegram_bundle_size CHECK(cardinality(appointment_ids) BETWEEN 1 AND 100)
);
ALTER TABLE public.telegram_ticket_bundles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_ticket_bundles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.telegram_ticket_bundles TO service_role;
CREATE INDEX IF NOT EXISTS telegram_bundles_expiry ON public.telegram_ticket_bundles(expires_at);
NOTIFY pgrst,'reload schema';
COMMIT;

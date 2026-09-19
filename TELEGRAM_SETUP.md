# Telegram setup for Nobatak

The code is prepared for `@nobatech_bot`. Adding a bot token alone does not activate delivery.

## Server-only environment variables (Vercel Production)

- `TELEGRAM_BOT_TOKEN`: bot token already supplied in Vercel. Never prefix secrets with `NEXT_PUBLIC_`.
- `SUPABASE_SERVICE_ROLE_KEY`: project's server-side service role key; never commit it.
- `TELEGRAM_WEBHOOK_SECRET`: a random alphanumeric secret of at least 32 characters.
- `TELEGRAM_NOTIFICATION_SECRET`: a different random secret of at least 32 characters.
- `NEXT_PUBLIC_SITE_URL`: permanent HTTPS site origin. If omitted on Vercel, bot management links use `VERCEL_PROJECT_PRODUCTION_URL`.

## Database

Run `appointment_dates_realtime.sql`, `daily_appointment_capacity.sql`, then `telegram_notifications.sql` in Supabase SQL Editor. The Telegram table is not accessible to anonymous or signed-in browser clients. Never expose its chat IDs in public policies.

## Activate Telegram's webhook

After deployment, use a trusted terminal with the environment variables available and run:

```sh
node scripts/setup-telegram.mjs
```

The script uses the token from the environment, registers `/api/telegram/webhook`, and checks that the token belongs to `nobatech_bot`. It never prints the token.

## Queue-change notifications

Create a Supabase Database Webhook on `public.appointments` for INSERT, UPDATE, DELETE. Destination: `https://YOUR-DOMAIN/api/telegram/notify` (POST).
Set the header `x-nobatak-notify-secret` to the same private value as `TELEGRAM_NOTIFICATION_SECRET`.

Notifications are event-driven and apply to today's waiting customers when 3 or fewer people remain, and when serving begins. There is no midnight scheduler: an appointment/queue event on that date triggers evaluation. Failed deliveries return an error; for guaranteed retry delivery, configure webhook retries or an external retry worker. This initial integration is not a durable message queue.

## Verify before inviting customers

Create a new test appointment on the deployed site. Click Telegram, press Start, request status, open management in Telegram's browser, and verify the exact same ticket appears. Test cancel with confirmation. Test stopping notices and then advancing the queue. Old receipts created before activation do not have signed tokens and cannot be attached merely by supplying an appointment ID.

Printed QR codes must be regenerated after setting a public domain. Rotating the bot token invalidates the current signed management links; new links from the bot use the new token.

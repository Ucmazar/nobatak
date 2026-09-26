# Nobatak performance audit — 2026-09-26

Baseline: e391cfa. Scope: local source/build and deterministic tests; live production latency and Supabase query plans are not assumed measured.

## Priorities before changes

| Priority | Evidence | Action |
| --- | --- | --- |
| High | Dashboard queue polls every 3s; access guard separately polls every 3s, even with healthy realtime | Coalesce events; 60s safety reconciliation when connected, 15s fallback when disconnected; pause hidden/offline tabs |
| High | Every appointment event, including other businesses, can trigger queue reads | Filter INSERT/UPDATE by business; handle DELETE by known row ID (Supabase cannot filter DELETE events) |
| High | Public business lookup repeats every 5s; network errors are indistinguishable from missing business | Event-driven refresh plus low-frequency verification, preserve data and show read errors |
| High | Status change: auth, profile, appointment, business, update in serial | Parallelize profile and joined appointment/business reads; preserve authorization |
| High | Telegram capability check repeats before booking and for every ticket; multi-ticket links recreate bundles | Short-lived public capability cache/SWR; coalesce simultaneous reads/bundle requests; never cache personal ticket responses |
| Medium | 531,710-byte original logo used directly for small header images | Responsive next/image, retain full-quality original for printable poster |
| Medium | QR library and PNG drawing code imported with dashboard | Load QR component only when settings open and ticket image code on demand |
| Medium | Queue positions recomputed by filtering all entries for each row (quadratic) | Precompute positions per staff/date in one grouped pass |
| Medium | Initial auth verified in layout then again in client guard before dashboard mounts | Seed guard from server-verified access report; no extra initial blocking fetch |
| Medium | Queue fetch errors can erase saved customer tickets | Strict live reads; preserve saved tickets on read failure; reconcile successful responses |
| Medium | Composite capacity/queue count scans lack matching indexes | Add optional idempotent indexes, retain existing indexes |

## Data policy

No response cache for appointment rows, queue numbers, mutations, account permissions or daily closure status. Only simultaneous identical queue reads are shared; a fresh reconciliation follows a mutation/reconnect. Optimistic status is explicitly pending and rolls back on failure. Public Telegram capability metadata alone receives a short TTL with stale-while-revalidate. Database triggers remain authoritative for capacity and day closure.

## References

- Supabase Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes (DELETE filters are not supported; primary-key-only old records must be handled).
- Installed Next.js documentation: lazy-loading, image, font and after under node_modules/next/dist/docs. Existing next/font is already self-hosted with swap; no speculative font replacement.

Results, migration instructions and remaining limitations are recorded after validation below.

## Validation and rollout

- Production build and TypeScript passed; git diff --check passed. Existing middleware deprecation warning remains.
- Embedded PostgreSQL tests passed: repeatable migration, ownership/RLS, mandatory reason, today-only cancellation, atomic rollback, idempotent replay, reopening, private outbox, disjoint claims and retry.
- Deterministic client tests passed: event coalescing, one in-flight refresh, trailing reconciliation, hidden-tab pause, cleanup, queue position equivalence and immutable optimistic overlay.
- Connected safety polling is now 60s rather than 3s (20x fewer timer-triggered reads per queue/access stream); realtime events still reconcile immediately. Public settings polling changes from 5s to 60s. Actual production latency has not been measured.
- Run supabase/daily_booking_control.sql in Supabase SQL Editor before using daily closure. It also enables the required realtime publication tables. Run supabase/performance_indexes.sql separately, outside a transaction; verify production query plans before removing any existing indexes.
- Daily cancellation messages persist transactionally. Owner can inspect counts and retry. For unattended backlog/retries configure a scheduler to POST /api/telegram/daily-notices with x-nobatak-notify-secret matching TELEGRAM_NOTIFICATION_SECRET. Each invocation claims up to 20 notices; choose frequency for traffic. Server service-role and Telegram configuration remain required. Never expose the secret to the browser.
- Delivery is at least once: Telegram success followed by a lost database acknowledgement can cause a duplicate on retry.
- SQL has been tested locally, not applied to production. Authenticated end-to-end interactions and weak-network device measurements remain unverified. Build timing benefits from existing build cache and is not a runtime latency benchmark.
- Public catalog cache stores presentation fields only and verifies live availability before booking. Private queue rows, live numbers, closure and access status are not cached as settled responses.
- Remaining separate work: admin list pagination at scale and existing disabled-account page polling. No SEO changes.

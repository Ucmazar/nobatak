# Free plan (آغاز)

Default for new accounts: one business, three active services, one active staff member, ten non-cancelled appointments per business/calendar date. Completed appointments count; cancellations release capacity. Staff capacity may lower, never raise, the business allowance. No paid plans or payment integration are enabled.

## Install

Run `supabase/free_plan.sql` in Supabase SQL Editor after the existing `independent_access_and_limits.sql`, `staff_daily_capacity.sql`, `daily_booking_control.sql`, and `booking_day_transfer.sql` migrations. Run the complete file. It is transactional and repeatable. It also updates holiday cascading transfers to respect the business-wide cap. Do not reapply older transfer migrations afterward without reapplying this migration.

No live database changes are performed by deploying the website alone. Until SQL is installed, the admin plans page explains the missing migration. Public booking retains compatibility with the old schema; database enforcement starts when SQL is installed.

Existing users with custom business allowances or resources above the free quotas keep `legacy` settings. No records are removed or subscriptions sold. The active superadmin can assign the free plan at `/admin/plans`; assignment rejects excessive businesses or active resources rather than deleting them. Existing booked appointments remain; additional bookings are blocked on dates already at the cap.

The existing per-user business allowance editor remains available for legacy accounts. Free accounts cannot raise their own limit. Active superadmins are exempt. Resource and booking triggers lock the business row to serialize quota checks. Existing ownership/RLS and staff-capacity checks remain enabled.

Verification: `node scripts/test-free-plan.cjs` (requires `@electric-sql/pglite` or `PGLITE_MODULE` pointing to it), TypeScript and production build. Live database migration and authenticated production UI still require deployment verification.

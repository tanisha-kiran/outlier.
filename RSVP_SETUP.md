# RSVP notifications

The website uses existing authenticated student emails; each teammate supplies their own GitHub, LinkedIn and motivation. Organizer activity and counts refresh every 30 seconds while `/events/admin` is open. Email is not active until the following setup is completed.

1. Run `supabase/005_rsvp_notifications.sql` in the project's SQL editor after migrations 001–004. It adds required event questions, server validation and a private email queue. Existing RSVPs are not revalidated or emailed retroactively.
2. Create a Resend account and verify a sender domain. Set Supabase Edge Function secrets `RESEND_API_KEY`, `RSVP_FROM_EMAIL` (a verified sender, such as `OUTLIER <events@your-domain>`), and `RSVP_CRON_SECRET` (a long random value). Never use `VITE_` for these secrets. The function uses Supabase's built-in service role secret on the server only.
3. Deploy: `supabase functions deploy rsvp-email --no-verify-jwt`. The function enforces its own `x-rsvp-cron-secret: <RSVP_CRON_SECRET>` check.
4. In Supabase Cron, schedule an HTTP POST every minute to `https://nnacqshqvfizfjfasecw.supabase.co/functions/v1/rsvp-email` with that `x-rsvp-cron-secret` header and an empty JSON body. Store the cron secret in Supabase Vault. Do not put it in public source code.
5. Make one real test team RSVP and confirm a queued record becomes `sent_at` and the email reaches `outlier.community.acs@gmail.com`. Failed deliveries stay queued for the next run. Resend idempotency protects normal retries; monitor failures lasting over 24 hours before retrying, as provider idempotency expires.

Email contains team name, event name, current team membership count and total event participant count. Personal email addresses and profile answers stay in the authenticated organizer dashboard. Creating a team sends one notification; joining that team increases counts but does not send another new-team email.

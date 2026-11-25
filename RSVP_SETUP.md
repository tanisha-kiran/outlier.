# RSVP notifications

## Delivery incident — 25 November 2026

Automatic sending is paused after Gmail rejected both an organizer alert and a participant confirmation as suspicious. Migration 012 adds the pause setting and manual bounce records; the `outlier-rsvp-email` cron job has also been disabled. New registrations still queue their messages. Previously accepted emails are not assumed delivered and are not automatically resent. One participant bounce supplied by the organizer has been recorded in production, scoped to its recipient and registration reference.

Revised messages use plain text with no website links or HTML. This is a controlled deliverability experiment, not a guarantee of inbox delivery. The dashboard distinguishes Gmail acceptance from known bounces and shows the pause. Gmail bounce monitoring is still manual. Before resuming, confirm an independent test reaches the recipient inbox and is not followed by a bounce. Then review stale queued messages and provider limits, enable `email_delivery_settings.enabled` and re-enable the cron job deliberately. Do not clear `sent_at` to retry accepted messages without reviewing delivery evidence. Keep bounced messages excluded.

## Active Gmail transport

The production scheduler endpoint is `rsvp-email`; its local entry imports the participant email worker. Gmail SMTP uses TLS on port 465 with `GMAIL_USER` and `GMAIL_APP_PASSWORD` stored only in Supabase secrets. Sender display name: OUTLIER Community. No Resend domain is needed for this transport.

Apply migrations 008 and 009, deploy `rsvp-email` with the existing custom cron-secret authorization, and invoke it every minute using `x-rsvp-cron-secret` from Vault. `OUTLIER_SITE_URL` defaults to `https://outlier.acs-community.workers.dev`. The Gmail secrets have already been saved in the project; never commit their values.

Migrations 010 and 011 support verifying the scheduler's Vault credential and configuring it once from the existing Edge Function secret. The bootstrap request requires a valid Supabase server secret in `apikey` and `x-configure-cron: true`; it refuses to overwrite a saved credential. These migrations and the bootstrap have been applied in production. The existing `outlier-rsvp-email` cron job posts every minute to `rsvp-email` with the Vault credential in `x-rsvp-cron-secret`.

Migration 009 claims five messages per run and pauses at a conservative rolling send-attempt budget of about 350, leaving room for ordinary mailbox use. Gmail may impose additional limits. Pending first-attempt messages resume when capacity becomes available. Retries stop after 23 hours; administrators must inspect errors. SMTP has no provider idempotency guarantee: a timeout after acceptance or a database failure after sending can cause a duplicate on retry. A stable Message-ID helps identify duplicates but does not guarantee suppression. `sent_at` means Gmail accepted the message, not proof of inbox placement. The dashboard tracks queued, sent and failed messages. Existing registrations are not emailed retroactively.

The instructions below document the previous Resend implementation and are not required for Gmail sending.

## Participant confirmations and invitations (new setup)

This supersedes the organizer-only worker below. It is not live until deployed.

1. Apply `supabase/008_participant_emails.sql` after all existing migrations, including both 005 files, 006 and 007. It queues new participant confirmations, organizer updates and teammate invitations. The confirmation includes a team code only for the team leader; teammates receive their own confirmation after they register. Existing RSVPs are not backfilled.
2. Verify a domain you own in Resend. A `workers.dev` website address does not give you ownership of that domain for sending email. Set `RSVP_FROM_EMAIL` to `OUTLIER Community <events@YOUR-VERIFIED-DOMAIN>` in Supabase secrets, along with `RESEND_API_KEY` and `RSVP_CRON_SECRET`. Set `OUTLIER_SITE_URL` to `https://outlier.acs-community.workers.dev`. Never put these secrets into frontend variables. Replies go to `outlier.community.acs@gmail.com`.
3. Deploy `supabase functions deploy participant-email --no-verify-jwt`. The worker verifies `x-rsvp-cron-secret` itself. Replace the old cron target with `/functions/v1/participant-email` and use this header from Vault. Disable the old `rsvp-email` schedule to avoid duplicate organizer messages.
4. Test with a consenting team leader and teammate: leader RSVP → leader confirmation with the team code + organizer alert + teammate invitation; teammate joins → their confirmation without the leader's code + new organizer alert. Verify the inboxes and the dashboard's Registration emails list. Invitations do not confirm a place. One private email is sent to each recipient; students never receive a public mailing list.
5. The queue claims 10 jobs at a time with a five-minute lock, uses a stable Resend idempotency key per message and retries independently. Automated retries stop 23 hours after the first attempt to stay inside Resend's 24-hour idempotency window. Review provider logs before manually retrying old jobs. `sent_at` means accepted by Resend, not proven inbox delivery. Check bounces in Resend; no delivery webhook is configured yet. Ensure provider quotas cover confirmations, invitations and organizer alerts.

The displayed sender is OUTLIER Community. Gmail is the organizer inbox and reply destination; this implementation sends through Resend, not through Gmail's sending API.

## Earlier organizer-only setup

The website uses existing authenticated student emails; each teammate supplies their own GitHub, LinkedIn and motivation. Organizer activity and counts refresh every 30 seconds while `/events/admin` is open. Email is not active until the following setup is completed.

1. Run `supabase/005_rsvp_notifications.sql` in the project's SQL editor after migrations 001–004. It adds required event questions, server validation and a private email queue. Existing RSVPs are not revalidated or emailed retroactively.
2. Create a Resend account and verify a sender domain. Set Supabase Edge Function secrets `RESEND_API_KEY`, `RSVP_FROM_EMAIL` (a verified sender, such as `OUTLIER <events@your-domain>`), and `RSVP_CRON_SECRET` (a long random value). Never use `VITE_` for these secrets. The function uses Supabase's built-in service role secret on the server only.
3. Deploy: `supabase functions deploy rsvp-email --no-verify-jwt`. The function enforces its own `x-rsvp-cron-secret: <RSVP_CRON_SECRET>` check.
4. In Supabase Cron, schedule an HTTP POST every minute to `https://nnacqshqvfizfjfasecw.supabase.co/functions/v1/rsvp-email` with that `x-rsvp-cron-secret` header and an empty JSON body. Store the cron secret in Supabase Vault. Do not put it in public source code.
5. Make one real test team RSVP and confirm a queued record becomes `sent_at` and the email reaches `outlier.community.acs@gmail.com`. Failed deliveries stay queued for the next run. Resend idempotency protects normal retries; monitor failures lasting over 24 hours before retrying, as provider idempotency expires.

Email contains team name, event name, current team membership count and total event participant count. Personal email addresses and profile answers stay in the authenticated organizer dashboard. Creating a team sends one notification; joining that team increases counts but does not send another new-team email.

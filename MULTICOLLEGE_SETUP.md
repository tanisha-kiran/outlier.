# Multi-college registration and student dashboard

The Vite application now collects a student’s college and allows students to view their OUTLIER event registrations at `/events/me`. Existing profiles retain Dr. ACS College of Engineering. Student IDs are unique per college, normalized by case and surrounding whitespace. College names are entered as text, so spelling variations are not deduplicated automatically.

## Release steps

1. Back up the existing Supabase project. Confirm migrations `001_outlier.sql`, `002_registration_details.sql`, and `003_community_events.sql` have already been applied. If 003 is not applied, follow `EVENTS_SETUP.md` first. Do not rerun migrations 001 or 002 on an existing project.
2. In the Supabase SQL Editor, run `supabase/004_multicollege.sql` exactly once. The frontend relies on the new `profiles.college` column; deploy it only after this migration succeeds. The migration preserves existing profile and participant records. It does not change event eligibility rules: organizers should set those for each event.
3. Set the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the host’s build settings. Configure the existing public origin in Supabase Authentication URL settings.
4. Deploy this source to the existing host, using `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, and output directory `dist`. The included SPA redirects cover `/events/me`. Avoid deploying until migration 004 is applied.
5. Test with a non-production Supabase project first: register students from two colleges, acknowledge WhatsApp, register them in a published native event, and verify the dashboard, sign-out, and profile changes. Never use the browser test fixtures in a production build.

The dashboard lists registrations for published OUTLIER-hosted events only. Past registrations do not establish attendance, and registrations on external event websites do not sync automatically. A student can update their own profile; changes to identity details reset verification to pending, as before. WhatsApp membership is self-acknowledged, not independently verified.

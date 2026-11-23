# Events and organizer dashboard

This extends the existing Vite site and Supabase schema. It does not create a new Supabase project or change Discover's Brabble feed. The event form follows Luma's basic structure (title, cover, dates, location, description, capacity and questions) with Outlier hackathon fields. This is not a Luma API integration: external registrations remain on their platform.

## One-time release setup

1. In the **existing** Supabase project's SQL Editor, run `supabase/003_community_events.sql`. The project must already have `001_outlier.sql` and `002_registration_details.sql`, or the combined `setup.sql`. **Do not rerun the original setup on an existing database.** Migration 003 extends tables and preserves existing rows. New installations start with no community events; create them from the organizer dashboard.
2. Sign up/sign in through the existing Outlier website with **Tanishakiran0909@gmail.com**, using your own password and the name you want displayed. Do not put a password in source code. In Supabase Authentication → Users, verify that this is your account (particularly if email confirmation is disabled). Run `supabase/admin_access.sql` in the SQL Editor. It grants the existing `private.admins` role to that user ID, preserving other existing administrators. No public signup can assign an admin role. To restrict the site to only one administrator, review existing `private.admins` entries manually; this release does not remove anyone's access.
3. Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Cloudflare build environment. These must point to the same project. No service-role key belongs in the frontend. Set production auth URL/redirect settings as described in README.
4. Deploy the updated frontend to the existing Cloudflare Pages project: `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`; output directory **dist**. Keep the project's existing repository root setting. The included `wrangler.jsonc` configures the existing static Worker to serve `dist` and use single-page application fallback for direct event URLs. No redirect rules are needed.
5. Visit `/events/admin` and sign in. Your saved profile name is shown, and the existing admin-role check unlocks the dashboard. Confirm the public hub in a signed-out browser and refresh a detail URL on the actual Cloudflare deployment.

Steps 1–4 are needed only for this feature release. Subsequent publishing needs no frontend rebuild.

## Publish the next event

1. Open **Events → All Events → Manage events**, or go directly to `/events/admin`. “Organizer sign in” is also in the Events footer.
2. Click **Create event**. Enter title, permanent slug, organizer, type and description. Add an optional cover image URL. The slug becomes `/events/your-slug` and cannot change after the event is saved.
3. Set date/time in **IST**, end time, format, venue and eligibility. Dates and venue may stay unset while announcing an event. Without an end date, the event becomes past when the start time passes; set an end date for a running multi-hour hackathon.
4. Choose registration: **Announced**, **On Outlier**, **External platform**, or **Closed**. For open registration, set start date and registration deadline. External registration also needs a HTTPS URL (e.g. the Luma event page). For Outlier registration set participant capacity, solo/team/both, and team limits. Add short-text, long-text or checkbox questions; mark required questions as needed. Core identity, contact and consent fields are already included.
5. Add rules, schedule, prizes and FAQ as needed. For project submissions, set both opening and closing time. Submission URLs are generated automatically at `/events/your-slug/submit`; registration is at `/events/your-slug/register`.
6. Keep **Draft** to save privately, or choose **Published** under Publication and click **Save event**. Optional empty fields are hidden on the public page. Only one published event can be featured; unfeature the old one first. Every page visit reads Supabase; an active idle hub refreshes after one minute.
7. After the event, open **Manage event**, add recap/results/showcase links, and add gallery image URLs with alt text and captions. Set individual photo visibility to **Published**. Photos appear only when both the event and photo are published. Set an event to Draft/Archived or a photo to Draft to hide it again.

## Registration and submissions

- Students use existing Outlier sign-in and profile completion. The same pending-but-not-suspended/rejected onboarding rule is retained; registration is not proof of verified enrollment. Organizers review eligibility.
- Each registered student supplies phone, event question answers, rules/data-use consent and optional photo consent. Profile name, email, USN, department, year and college are captured with the registration. Question labels and rules are snapshotted with consent timestamps.
- A solo student creates one entry. A team leader creates a team and receives a private UUID invite code. Each teammate signs in, selects **Join a team**, and enters that code, their contact details and consent. No leader submits another student's personal details or consent. The confirmation page lists confirmed member names, not teammates' contact details.
- Capacity counts participants. Team leaders do not reserve unfilled places. Teams must meet the event minimum before final project submission. Students cannot join multiple entries for the same event; repeated submissions of the registration form do not create duplicates. Roster changes and withdrawals require organizer support for this release; do not delete participant records to bypass consent/history.
- The organizer can read participants, answers and project submissions in **Manage event → Registrations & projects**. Other students cannot read private participant records. The leader or solo registrant can save/revise a project until the database-enforced submission deadline. A final project requires a source repository and demo/build or video URL. Drafts are excluded from the submitted count. Saving a submitted project as draft withdraws it from that count until resubmitted.
- Links can change externally after the deadline. Ask for a final commit/release reference if judging requires an immutable source version. No code/video files are hosted by this feature. No automatic emails, ticket payments, waiting list, Luma attendee synchronization or public project showcase are implied; use external registration where those services are needed. Outlier confirmation is on-screen.
- Database functions serialize joins against the event row to enforce capacity/team limits. Table writes are denied to students; registration/submission RPCs validate ownership, profile eligibility, consent and deadlines. Public reads include only published community events and published photos of published events. Existing external-event access policies and the Discover snapshot are preserved.

## Verification

Run `pnpm test` (or `node --test tests/events.test.js`) and `pnpm build`. Tests run migrations in disposable embedded PostgreSQL with Supabase-like auth roles, never production. They exercise RLS, admin setup, draft/photo privacy, registration consent/questions, duplicate entries, team invitations, capacity, private records, team submission authority and expired deadlines, plus IST conversion and upcoming/past sorting.

For isolated UI testing: `node node_modules/vite/bin/vite.js --config tests/preview.config.js`. This **QA-only** config replaces authentication/database calls with local browser fixtures. It must never be used to build/deploy production. Standard builds do not import these fixtures. UI fixtures can be reset by clearing site data for the local preview origin. The real production migration contains no public demo events or gallery images.

Before release, use a staging Supabase project to test actual sign-in, solo/team registration, editor saves and gallery images. Check anonymous versus administrator access, date/time boundaries, and a fresh direct URL on Cloudflare. The local verification does not establish production credentials, deployment routing, SMTP or live Supabase connectivity.

## Google Forms, team codes and winners

After migration 003, run `supabase/005_simple_event_submissions.sql`, then deploy the updated frontend. Do not run the discarded 004 judging prototype. Existing registrations and earlier native submission records are preserved; native submission writes are disabled.

In Manage event, paste your Google Form responder link under Project submissions. Add required questions for team code, project name and project/demo links. Google Forms stores responses separately; set its own response deadline as well as the Outlier display deadline. Students create a team to receive a unique code; each teammate joins using that code and their own account. The admin team cards show members and the code for matching form responses. The team leader submits once through the form. Solo participants use their entry reference.

Use Winners & projects in Manage event to add or edit first, second and third place, project links and descriptions. Select Published to display a winner on a published event page. Drafts remain private. No automatic shortlisting or judging is performed.

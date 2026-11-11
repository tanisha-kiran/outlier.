# OUTLIER — 3D Vite landing page

A responsive Vite landing page with a Three.js animated hero, the supplied artwork and college logo, the OUTLIER WhatsApp community link, and upcoming India and online hackathons imported from Brabble’s public RSS feed.

## Run locally

Install Node.js 20.19+ or 22.12+ and pnpm, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For production: `pnpm build`. Serve the generated `dist` directory on any static host. Listings are imported from Brabble’s public RSS feed, stored in public/india-events.json, and linked to Brabble listings. The feed is a snapshot, not a live API; run node scripts/import-india.mjs to refresh it. A six-hour GitHub Actions workflow is included but only runs after the project is pushed to GitHub with Actions enabled and write permission, and the hosting service must rebuild from commits. It is not active in this local preview. The feed contains at most 100 items and the page shows up to 12 matching India or online items. Check event eligibility and deadlines on the organizer's website. The events are worldwide and do not imply eligibility for ASCE students.

The artwork file is `public/art.png` and the supplied institutional image is `public/college-logo.png`. This Vite project is a landing page; the earlier Next.js/Supabase application in `../outlier` contains the student and administrative workflows and is not connected to this page.

Source: https://brabble.ai/rss/hackathons.xml

## Student registration and WhatsApp gate

The landing page now requires an authenticated account with a completed student profile and a WhatsApp acknowledgment before it requests event listings. The shared project schema requires manual administrator verification for the separate Next.js application; this Vite landing page unlocks after self-acknowledgment unless the account is suspended or rejected. WhatsApp membership cannot be verified by this website: the checkbox is the student's statement, not proof. The public third-party Hackalendar API remains independently accessible outside this website.

To enable accounts, create a Supabase project and run the original `supabase/001_outlier.sql` followed by `supabase/002_registration_details.sql` in its SQL editor. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from that project. These are public client values; never use a service-role key. Rebuild after changing them. Enable email/password auth and turn off Confirm email for the requested immediate sign-in flow; set minimum password length to 12 and configure production SMTP for password recovery. In Supabase Authentication URL Configuration set the Site URL to the production site origin and allow that origin as a redirect URL; use localhost for local testing. Existing student profiles are completed at the first login if missing USN or department. Verify email confirmation, registration, sign-in, WhatsApp acknowledgment, returning sessions and sign-out against the actual project before launch. Administrators can see student profiles in the Supabase dashboard; the existing Next.js admin application is available separately once configured with the same Supabase project.

Student identity fields are stored in the RLS-protected profiles table; email and password are handled by Supabase Auth. The Vite app must not contain a secret key. Configure a contact and retention policy before campus-wide use. No live database exists until the project and environment values are supplied. The supplied GIF is `public/reveal.gif` and plays as the opening reveal; reduced-motion users skip it.

### Password recovery

Students can select **Forgot password?** from sign-in and request a reset email. Supabase Auth sends the recovery link; the student opens the newest link on the computer hosting the local preview, then enters and confirms a new password. The browser-only app uses Supabase’s implicit recovery flow, so it does not depend on a PKCE verifier in the requesting browser. Show/Hide controls are available on sign-up, sign-in, and both new-password fields. Account passwords are managed by Supabase Auth and are never available for organizers to view. In Supabase Authentication → URL Configuration, allow the site origin with `/?reset=1` as a redirect, and configure SMTP before wider use. Test an actual recovery email on the deployed domain; a localhost email link works only on the same computer. A missing/expired reset session asks the student to request a new link.

Existing accounts created before profiles existed are backfilled by `supabase/setup.sql`. Run this combined setup only once in a new project. With email confirmation disabled, sign-up does not prove that a student owns their email address. Password recovery still requires a real reachable email address and working email delivery. The WhatsApp checkbox is self-attestation, not automatic group verification.

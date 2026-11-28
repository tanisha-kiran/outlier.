-- Close registration for Play for a Purpose (sold out).
-- Preserves all existing registrations, participant details, team rosters,
-- team codes, submissions, and event records.
update public.events
set registration_mode = 'closed'
where slug = 'play-for-a-purpose';

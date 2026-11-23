-- Required answers for this event; preserve other questions.
update public.events set registration_questions =
 (select coalesce(jsonb_agg(q),'[]'::jsonb) from jsonb_array_elements(registration_questions) q where q->>'id' not in ('github','linkedin','motivation')) ||
 '[{"id":"github","label":"GitHub profile link","type":"text","required":true},{"id":"linkedin","label":"LinkedIn profile link","type":"text","required":true},{"id":"motivation","label":"Why do you want to join this hackathon?","type":"textarea","required":true}]'::jsonb
where slug='play-for-a-purpose';

create table if not exists public.rsvp_email_queue (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null unique references public.event_registrations(id) on delete cascade,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table public.rsvp_email_queue enable row level security;
revoke all on public.rsvp_email_queue from anon,authenticated;
grant all on public.rsvp_email_queue to service_role;
create or replace function public.queue_team_rsvp_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.participation='team' then insert into public.rsvp_email_queue(registration_id) values(new.id) on conflict do nothing; end if;
 return new;
end $$;
revoke all on function public.queue_team_rsvp_email() from public;
drop trigger if exists team_rsvp_email on public.event_registrations;
create trigger team_rsvp_email after insert on public.event_registrations for each row execute function public.queue_team_rsvp_email();

create or replace function public.validate_hackathon_rsvp() returns trigger
language plpgsql set search_path=public as $$
begin
 if exists(select 1 from public.events where id=new.event_id and slug='play-for-a-purpose') then
  if coalesce(new.answers->>'github','') !~ '^https://(www\.)?github\.com/[A-Za-z0-9_-]+/?$' then raise exception 'A valid GitHub profile URL is required'; end if;
  if coalesce(new.answers->>'linkedin','') !~ '^https://(www\.)?linkedin\.com/in/[^/?# ]+/?([?#].*)?$' then raise exception 'A valid LinkedIn profile URL is required'; end if;
  if length(trim(coalesce(new.answers->>'motivation',''))) not between 10 and 2000 then raise exception 'Tell us why you want to join (10–2000 characters)'; end if;
 end if;
 return new;
end $$;
drop trigger if exists validate_hackathon_rsvp on public.event_participants;
create trigger validate_hackathon_rsvp before insert on public.event_participants for each row execute function public.validate_hackathon_rsvp();

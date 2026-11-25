begin;
alter table public.email_delivery_settings add column if not exists send_from timestamptz;
create or replace function public.claim_event_emails() returns setof public.event_email_outbox
language sql security definer set search_path='' as $$
 update public.event_email_outbox set available_at=now()+interval '5 minutes',
  attempts=1,first_attempt_at=now()
 where id in (
  select pending.id
  from public.event_email_outbox pending
  join public.email_delivery_settings settings
   on settings.enabled and pending.created_at>=settings.send_from
  where pending.sent_at is null and pending.bounced_at is null
   and pending.available_at<=now() and pending.first_attempt_at is null
   and not exists (
    select 1 from public.event_email_outbox bounced
    where bounced.recipient=pending.recipient and bounced.bounced_at is not null
   )
   and (pending.kind<>'invitation' or exists (
    select 1
    from public.event_registrations registration
    join public.event_participants leader
     on leader.registration_id=registration.id and leader.user_id=registration.owner_id
    where registration.id=pending.registration_id
     and leader.answers->'outlier_team_email_requested'='true'::jsonb
   ))
   and (select count(*) from public.event_email_outbox where first_attempt_at>now()-interval '24 hours')<345
  order by pending.created_at,pending.id
  for update of pending skip locked limit 1
 ) returning *;
$$;
commit;

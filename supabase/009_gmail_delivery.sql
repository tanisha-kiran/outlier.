-- Gmail transport: small batches and a conservative rolling send-attempt budget.
create or replace function public.claim_event_emails() returns setof public.event_email_outbox
language sql security definer set search_path='' as $$
 update public.event_email_outbox set available_at=now()+interval '5 minutes',attempts=attempts+1,
 first_attempt_at=coalesce(first_attempt_at,now())
 where id in (
  select id from public.event_email_outbox where sent_at is null and available_at<=now()
  and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
  and (select coalesce(sum(attempts),0) from public.event_email_outbox where first_attempt_at>now()-interval '24 hours')<345
  order by created_at for update skip locked limit 5
 ) returning *;
$$;
revoke all on function public.claim_event_emails() from public,anon,authenticated;
grant execute on function public.claim_event_emails() to service_role;

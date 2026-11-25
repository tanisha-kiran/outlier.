begin;
alter table public.event_email_outbox add column bounced_at timestamptz;
alter table public.event_email_outbox add column bounce_reason text;
create table public.email_delivery_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 reason text not null default 'Paused while Gmail delivery is being verified.'
);
insert into public.email_delivery_settings(id,enabled) values(true,false);
alter table public.email_delivery_settings enable row level security;
revoke all on public.email_delivery_settings from anon,authenticated;
grant select on public.email_delivery_settings to authenticated;
grant all on public.email_delivery_settings to service_role;
create policy email_settings_admin_read on public.email_delivery_settings for select to authenticated using(public.is_admin());
create or replace function public.claim_event_emails() returns setof public.event_email_outbox
language sql security definer set search_path='' as $$
 update public.event_email_outbox set available_at=now()+interval '5 minutes',attempts=attempts+1,
 first_attempt_at=coalesce(first_attempt_at,now())
 where id in (
  select id from public.event_email_outbox where sent_at is null and bounced_at is null and available_at<=now()
  and exists(select 1 from public.email_delivery_settings where enabled)
  and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
  and (select coalesce(sum(attempts),0) from public.event_email_outbox where first_attempt_at>now()-interval '24 hours')<345
  order by created_at for update skip locked limit 5
 ) returning *;
$$;
revoke all on function public.claim_event_emails() from public,anon,authenticated;
grant execute on function public.claim_event_emails() to service_role;
commit;

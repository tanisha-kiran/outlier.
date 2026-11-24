-- Apply after migrations 001–007, including 005_rsvp_notifications.sql.
-- New registrations only: existing students are not emailed retroactively.
begin;
create table public.event_email_outbox (
 id uuid primary key default gen_random_uuid(),
 registration_id uuid not null references public.event_registrations on delete cascade,
 kind text not null check(kind in ('confirmation','invitation','admin')),
 recipient text not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 first_attempt_at timestamptz,
 available_at timestamptz not null default now(),
 attempts integer not null default 0,
 sent_at timestamptz,
 provider_id text,
 last_error text,
 unique(registration_id,kind,recipient)
);
alter table public.event_email_outbox enable row level security;
revoke all on public.event_email_outbox from anon,authenticated;
grant all on public.event_email_outbox to service_role;
grant select on public.event_email_outbox to authenticated;
create policy email_admin_read on public.event_email_outbox for select to authenticated using(public.is_admin());
create index event_email_pending on public.event_email_outbox(available_at) where sent_at is null;

create function public.enqueue_event_email() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.event_registrations; e public.events; payload jsonb; recipient text; confirmed integer; total integer;
begin
 select * into strict r from public.event_registrations where id=new.registration_id;
 select * into strict e from public.events where id=r.event_id;
 select count(*) into confirmed from public.event_participants where registration_id=r.id;
 select count(*) into total from public.event_participants where event_id=e.id;
 payload:=jsonb_build_object('title',e.title,'slug',e.slug,'starts_at',e.starts_at,'location',e.location,'mode',e.mode,
 'team',r.team_name,'reference',r.reference_code,'invite_code',r.invite_code,'confirmed',confirmed,'total',total,
 'max_team',e.max_team,'min_team',greatest(2,e.min_team),'participation',r.participation);
 if tg_table_name='event_participants' then
  recipient:=lower(trim(coalesce(nullif(new.answers->>'contact_email',''),new.email)));
  if recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(recipient)>254 then raise exception 'Enter a valid contact email'; end if;
  payload:=payload||jsonb_build_object('name',new.full_name,'email',recipient,'college',new.college,'usn',new.usn,'leader',new.user_id=r.owner_id);
  insert into public.event_email_outbox(registration_id,kind,recipient,payload) values(r.id,'confirmation',recipient,payload) on conflict do nothing;
  -- Each participant produces an organizer update, keyed by their user ID.
  insert into public.event_email_outbox(registration_id,kind,recipient,payload)
   values(r.id,'admin',new.user_id::text,payload) on conflict do nothing;
 else
  recipient:=lower(trim(new.email));
  if not exists(select 1 from public.event_participants where registration_id=r.id and lower(email)=recipient) then
   insert into public.event_email_outbox(registration_id,kind,recipient,payload)
    values(r.id,'invitation',recipient,payload||jsonb_build_object('name',new.name)) on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.enqueue_event_email() from public;
create trigger participant_email after insert on public.event_participants for each row execute function public.enqueue_event_email();
create trigger invited_email after insert on public.event_invited_members for each row execute function public.enqueue_event_email();

create function public.claim_event_emails() returns setof public.event_email_outbox language sql security definer set search_path='' as $$
 update public.event_email_outbox set available_at=now()+interval '5 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
 where id in (select id from public.event_email_outbox where sent_at is null and available_at<=now()
 and (first_attempt_at is null or first_attempt_at>now()-interval '23 hours')
 order by created_at for update skip locked limit 10) returning *;
$$;
revoke all on function public.claim_event_emails() from public,anon,authenticated;
grant execute on function public.claim_event_emails() to service_role;
commit;

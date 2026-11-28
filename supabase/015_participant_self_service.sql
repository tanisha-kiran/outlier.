-- Participant self-service: view/edit member names & emails and cancel registration.
begin;

create or replace function public.registration_members(rid uuid)
returns table(full_name text, email text, is_leader boolean, is_me boolean)
language sql stable security definer set search_path='' as $$
  select
    p.full_name,
    coalesce(nullif(trim(p.answers->>'contact_email'), ''), p.email) as email,
    p.user_id = r.owner_id as is_leader,
    p.user_id = auth.uid() as is_me
  from public.event_participants p
  join public.event_registrations r on r.id = p.registration_id
  where r.id = rid and (public.in_event_registration(rid) or public.is_admin())
  order by p.consent_at;
$$;
revoke all on function public.registration_members(uuid) from public, anon;
grant execute on function public.registration_members(uuid) to authenticated;

-- Do not send new teammate invitation emails when registration is closed/sold out.
create or replace function public.enqueue_event_email() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.event_registrations; e public.events; payload jsonb; recipient text; confirmed integer; total integer;
begin
  select * into strict r from public.event_registrations where id=new.registration_id;
  select * into strict e from public.events where id=r.event_id;
  if tg_table_name='event_invited_members' and e.registration_mode='closed' then
    return new;
  end if;
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

create or replace function public.update_registration_members(
  rid uuid,
  my_name text,
  my_email text,
  invited_members jsonb default null
) returns void
language plpgsql security definer set search_path='' as $$
declare
  r public.event_registrations;
  e public.events;
  clean_name text;
  clean_email text;
  member jsonb;
  m_name text;
  m_email text;
begin
  if auth.uid() is null then raise exception 'Sign in to update your registration'; end if;
  select * into r from public.event_registrations where id = rid for update;
  if not found or not public.in_event_registration(rid) then raise exception 'Registration not found'; end if;
  select * into e from public.events where id = r.event_id;

  clean_name := trim(coalesce(my_name, ''));
  clean_email := lower(trim(coalesce(my_email, '')));
  if length(clean_name) < 2 or length(clean_name) > 100 then
    raise exception 'Enter a valid full name (2–100 characters)';
  end if;
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(clean_email) > 254 then
    raise exception 'Enter a valid email address';
  end if;

  update public.event_participants
  set full_name = clean_name,
      answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object('contact_email', clean_email)
  where registration_id = rid and user_id = auth.uid();

  if invited_members is not null then
    if r.owner_id <> auth.uid() then
      raise exception 'Only the team leader can edit provided teammate details';
    end if;
    if jsonb_typeof(invited_members) <> 'array' then
      raise exception 'Invalid teammate details';
    end if;
    if jsonb_array_length(invited_members) > greatest(coalesce(e.max_team, 1) - 1, 0) then
      raise exception 'Too many teammates listed';
    end if;

    delete from public.event_invited_members where registration_id = rid;
    for member in select value from jsonb_array_elements(invited_members) loop
      m_name := trim(coalesce(member->>'name', ''));
      m_email := lower(trim(coalesce(member->>'email', '')));
      if length(m_name) < 2 or length(m_name) > 100 then
        raise exception 'Enter a valid teammate name (2–100 characters)';
      end if;
      if m_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(m_email) > 254 then
        raise exception 'Enter a valid teammate email address';
      end if;
      insert into public.event_invited_members(registration_id, name, email)
      values (rid, m_name, m_email);
    end loop;
  end if;
end $$;
revoke all on function public.update_registration_members(uuid, text, text, jsonb) from public, anon;
grant execute on function public.update_registration_members(uuid, text, text, jsonb) to authenticated;

create or replace function public.cancel_event_registration(eid uuid)
returns void
language plpgsql security definer set search_path='' as $$
declare
  membership public.event_participants;
  reg public.event_registrations;
  next_owner uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to cancel your registration'; end if;
  select * into membership from public.event_participants where event_id = eid and user_id = auth.uid() for update;
  if not found then raise exception 'You are not registered for this event'; end if;
  select * into reg from public.event_registrations where id = membership.registration_id for update;

  delete from public.event_participants where id = membership.id;

  select user_id into next_owner
  from public.event_participants
  where registration_id = reg.id
  order by consent_at
  limit 1;

  if next_owner is null then
    delete from public.event_registrations where id = reg.id;
  elsif reg.owner_id = auth.uid() then
    update public.event_registrations set owner_id = next_owner where id = reg.id;
  end if;
end $$;
revoke all on function public.cancel_event_registration(uuid) from public, anon;
grant execute on function public.cancel_event_registration(uuid) to authenticated;

commit;

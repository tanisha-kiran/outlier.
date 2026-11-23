-- Apply once AFTER 001 + 002 (or the combined setup.sql), never rerun setup.sql.
begin;
alter table public.events
 alter column deadline drop not null,
 alter column apply_url drop not null,
 alter column source_url drop not null,
 add column is_community boolean not null default false,
 add column featured boolean not null default false,
 add column cover_url text check(cover_url is null or cover_url ~ '^https://'),
 add column registration_mode text not null default 'announced' check(registration_mode in ('announced','native','external','closed')),
 add column registration_opens_at timestamptz,
 add column capacity integer check(capacity between 1 and 100000),
 add column participation text not null default 'both' check(participation in ('solo','team','both')),
 add column rules text not null default '' check(length(rules)<=12000),
 add column schedule text not null default '' check(length(schedule)<=12000),
 add column faq text not null default '' check(length(faq)<=12000),
 add column recap text not null default '' check(length(recap)<=12000),
 add column results_url text check(results_url is null or results_url ~ '^https://'),
 add column demos_url text check(demos_url is null or demos_url ~ '^https://'),
 add column submission_opens_at timestamptz,
 add column submission_deadline timestamptz,
 add column registration_questions jsonb not null default '[]' check(jsonb_typeof(registration_questions)='array' and jsonb_array_length(registration_questions)<=15),
 add constraint event_registration_dates check(deadline is null or registration_opens_at is null or deadline>registration_opens_at),
 add constraint event_submission_dates check(submission_deadline is null or submission_opens_at is null or submission_deadline>submission_opens_at),
 add constraint event_open_registration check(not is_community or registration_mode not in ('native','external') or (starts_at is not null and deadline is not null)),
 add constraint event_external_registration check(not is_community or registration_mode<>'external' or apply_url is not null);
create index community_events_listing on public.events(is_community,status,starts_at);
create unique index one_featured_community_event on public.events(featured) where featured and is_community and status='published';
drop policy event_read on public.events;
create policy event_read on public.events for select using(public.is_admin() or (status='published' and (is_community or public.is_verified())));
create or replace view public.opportunity_catalog with (security_barrier=true) as
 select id,slug,title,organizer,mode,location,category,deadline,starts_at,prize,tags,verified_at,created_at
 from public.events where status='published' and not is_community;

create table public.event_photos (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 image_url text not null check(image_url ~ '^https://' and length(image_url)<=2000),
 alt text not null check(length(trim(alt)) between 3 and 300), caption text not null default '' check(length(caption)<=1000),
 status text not null default 'draft' check(status in ('draft','published')), sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.event_photos enable row level security;
grant select on public.event_photos to anon,authenticated;
grant insert,update,delete on public.event_photos to authenticated;
create policy photos_read on public.event_photos for select using(public.is_admin() or (status='published' and exists(select 1 from public.events e where e.id=event_id and e.is_community and e.status='published')));
create policy photos_admin on public.event_photos for all to authenticated using(public.is_admin()) with check(public.is_admin());

create table public.event_registrations (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events,
 owner_id uuid not null references public.profiles, participation text not null check(participation in ('solo','team')),
 team_name text not null default '' check(length(team_name)<=80),
 invite_code uuid not null unique default gen_random_uuid(), created_at timestamptz not null default now(),
 unique(id,event_id), unique(event_id,owner_id), check(participation='solo' or length(trim(team_name))>=3)
);
create table public.event_participants (
 event_id uuid not null references public.events, registration_id uuid not null,
 user_id uuid not null references public.profiles,
 full_name text not null, email text not null, usn text not null, department text not null, year integer not null,
 college text not null default 'Dr. ACS College of Engineering',
 phone text not null check(phone ~ '^\+?[0-9 ()-]{7,20}$'),
 answers jsonb not null default '{}', question_snapshot jsonb not null default '[]',
 rules_snapshot text not null, consent_version text not null default 'outlier-registration-v1',
 consent_at timestamptz not null default now(), photo_consent boolean not null default false,
 primary key(event_id,user_id), unique(event_id,usn),
 foreign key(registration_id,event_id) references public.event_registrations(id,event_id)
);
create table public.event_submissions (
 registration_id uuid primary key references public.event_registrations,
 title text not null check(length(trim(title)) between 3 and 160),
 overview text not null check(length(trim(overview)) between 20 and 12000),
 purpose text not null default '' check(length(purpose)<=4000), technologies text not null default '' check(length(technologies)<=1000),
 repository_url text not null check(repository_url ~ '^https://' and length(repository_url)<=2000),
 demo_url text check(demo_url is null or (demo_url ~ '^https://' and length(demo_url)<=2000)),
 video_url text check(video_url is null or (video_url ~ '^https://' and length(video_url)<=2000)),
 slides_url text check(slides_url is null or (slides_url ~ '^https://' and length(slides_url)<=2000)),
 instructions text not null default '' check(length(instructions)<=6000),
 commit_ref text not null default '' check(length(commit_ref)<=100),
 status text not null default 'draft' check(status in ('draft','submitted')),
 updated_at timestamptz not null default now(), submitted_at timestamptz
);
alter table public.event_registrations enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_submissions enable row level security;
-- Browser mutations use validated RPCs exclusively, including for administrators.
revoke all on public.event_registrations,public.event_participants,public.event_submissions from anon,authenticated;
grant select on public.event_registrations,public.event_participants,public.event_submissions to authenticated;
create function public.in_event_registration(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.event_participants where registration_id=rid and user_id=auth.uid())
$$;
revoke all on function public.in_event_registration(uuid) from public,anon;
grant execute on function public.in_event_registration(uuid) to authenticated;
create policy registration_read on public.event_registrations for select to authenticated using(public.is_admin() or public.in_event_registration(id));
create policy participant_read on public.event_participants for select to authenticated using(public.is_admin() or user_id=auth.uid());
create policy submission_read on public.event_submissions for select to authenticated using(public.is_admin() or public.in_event_registration(registration_id));

create function public.register_for_event(eid uuid, kind text, team_name_input text, join_code text, phone_input text, answers_input jsonb, accept_rules boolean, allow_photos boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events; p public.profiles; r public.event_registrations; q jsonb; v text; mail text; total integer;
begin
 if auth.uid() is null then raise exception 'Sign in to register'; end if;
 select * into e from public.events where id=eid for update; -- serializes capacity + team joins
 if not found or not e.is_community or e.status<>'published' then raise exception 'Event unavailable'; end if;
 if e.registration_mode<>'native' or e.deadline is null or now()>=e.deadline or (e.registration_opens_at is not null and now()<e.registration_opens_at) or now()>=coalesce(e.ends_at,e.starts_at) then raise exception 'Registration is not open'; end if;
 select * into p from public.profiles where id=auth.uid();
 if not found or p.verification_status in ('rejected','suspended') or p.usn='' or p.department='' or p.whatsapp_acknowledged_at is null then raise exception 'Complete your student profile first'; end if;
 if accept_rules is distinct from true then raise exception 'Accept the event rules and registration consent'; end if;
 if exists(select 1 from public.event_participants where event_id=eid and user_id=auth.uid()) then raise exception 'You are already registered for this event'; end if;
 select count(*) into total from public.event_participants where event_id=eid;
 if e.capacity is not null and total>=e.capacity then raise exception 'This event is full'; end if;
 if answers_input is null or jsonb_typeof(answers_input)<>'object' or octet_length(answers_input::text)>30000 then raise exception 'Invalid registration answers'; end if;
 for q in select value from jsonb_array_elements(e.registration_questions) loop
   v:=trim(coalesce(answers_input->>(q->>'id'),''));
   if coalesce((q->>'required')::boolean,false) and (v='' or (q->>'type'='checkbox' and v<>'true')) then raise exception 'Please answer: %',q->>'label'; end if;
   if length(v)>2000 then raise exception 'Answer too long'; end if;
 end loop;
 if nullif(trim(join_code),'') is not null then
   select * into r from public.event_registrations where event_id=eid and invite_code::text=trim(join_code) and participation='team';
   if not found or e.participation='solo' then raise exception 'Invalid team invite code'; end if;
   if (select count(*) from public.event_participants where registration_id=r.id)>=e.max_team then raise exception 'This team is full'; end if;
   if exists(select 1 from public.event_submissions where registration_id=r.id and status='submitted') then raise exception 'This team has already submitted its project'; end if;
 else
   if kind is null or kind not in ('solo','team') or (e.participation<>'both' and kind<>e.participation) then raise exception 'Invalid participation type'; end if;
   insert into public.event_registrations(event_id,owner_id,participation,team_name) values(eid,auth.uid(),kind,case when kind='team' then trim(team_name_input) else '' end) returning * into r;
 end if;
 select email into mail from auth.users where id=auth.uid();
 insert into public.event_participants(event_id,registration_id,user_id,full_name,email,usn,department,year,phone,answers,question_snapshot,rules_snapshot,photo_consent)
 values(eid,r.id,auth.uid(),p.full_name,mail,upper(trim(p.usn)),p.department,p.year,trim(phone_input),answers_input,e.registration_questions,e.rules,coalesce(allow_photos,false));
 return r.id;
end $$;
revoke all on function public.register_for_event(uuid,text,text,text,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.register_for_event(uuid,text,text,text,text,jsonb,boolean,boolean) to authenticated;

create function public.registration_roster(rid uuid) returns table(full_name text, is_leader boolean)
language sql stable security definer set search_path='' as $$
 select p.full_name,p.user_id=r.owner_id from public.event_participants p join public.event_registrations r on r.id=p.registration_id
 where r.id=rid and (public.in_event_registration(rid) or public.is_admin()) order by p.consent_at
$$;
revoke all on function public.registration_roster(uuid) from public,anon;
grant execute on function public.registration_roster(uuid) to authenticated;

create function public.save_event_submission(rid uuid, payload jsonb, finalize boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.event_registrations; e public.events; n integer;
begin
 select * into r from public.event_registrations where id=rid and owner_id=auth.uid();
 if not found then raise exception 'Only the registered solo participant or team leader can submit'; end if;
 select * into e from public.events where id=r.event_id for update;
 if e.status<>'published' or e.submission_opens_at is null or e.submission_deadline is null or now()<e.submission_opens_at or now()>=e.submission_deadline then raise exception 'Project submissions are closed'; end if;
 if exists(select 1 from public.event_participants ep join public.profiles p on p.id=ep.user_id where ep.registration_id=rid and p.verification_status in ('rejected','suspended')) then raise exception 'A participant account needs organizer review'; end if;
 select count(*) into n from public.event_participants where registration_id=rid;
 if finalize and r.participation='team' and (n<greatest(2,e.min_team) or n>e.max_team) then raise exception 'Your team does not meet the event team-size limits'; end if;
 if finalize and nullif(trim(payload->>'demo_url'),'') is null and nullif(trim(payload->>'video_url'),'') is null then raise exception 'Include a playable demo or demo video'; end if;
 insert into public.event_submissions(registration_id,title,overview,purpose,technologies,repository_url,demo_url,video_url,slides_url,instructions,commit_ref,status,submitted_at)
 values(rid,trim(payload->>'title'),trim(payload->>'overview'),coalesce(payload->>'purpose',''),coalesce(payload->>'technologies',''),trim(payload->>'repository_url'),nullif(trim(payload->>'demo_url'),''),nullif(trim(payload->>'video_url'),''),nullif(trim(payload->>'slides_url'),''),coalesce(payload->>'instructions',''),coalesce(payload->>'commit_ref',''),case when finalize then 'submitted' else 'draft' end,case when finalize then now() end)
 on conflict(registration_id) do update set title=excluded.title,overview=excluded.overview,purpose=excluded.purpose,technologies=excluded.technologies,repository_url=excluded.repository_url,demo_url=excluded.demo_url,video_url=excluded.video_url,slides_url=excluded.slides_url,instructions=excluded.instructions,commit_ref=excluded.commit_ref,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now();
end $$;
revoke all on function public.save_event_submission(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_event_submission(uuid,jsonb,boolean) to authenticated;

create function public.validate_community_event() returns trigger language plpgsql set search_path='' as $$
declare q jsonb;
begin
 if new.is_community then
   if new.slug='admin' then raise exception 'The slug admin is reserved'; end if;
   if (new.submission_opens_at is null)<>(new.submission_deadline is null) then raise exception 'Set both submission dates'; end if;
   if new.participation<>'solo' and new.max_team<2 then raise exception 'Teams need at least two places'; end if;
   for q in select value from jsonb_array_elements(new.registration_questions) loop
     if jsonb_typeof(q)<>'object' or coalesce(q->>'id','') !~ '^[a-z0-9_-]{1,60}$' or length(trim(coalesce(q->>'label',''))) not between 1 and 200 or coalesce(q->>'type','') not in ('text','textarea','checkbox') or jsonb_typeof(q->'required') is distinct from 'boolean' then raise exception 'Invalid registration question'; end if;
   end loop;
   if (select count(distinct value->>'id') from jsonb_array_elements(new.registration_questions))<>jsonb_array_length(new.registration_questions) then raise exception 'Question IDs must be unique'; end if;
   if tg_op='UPDATE' then
     if new.slug<>old.slug then raise exception 'Event links are permanent; slug cannot change'; end if;
     if exists(select 1 from public.event_participants where event_id=new.id) then
       if (new.participation,new.min_team,new.max_team) is distinct from (old.participation,old.min_team,old.max_team) or (new.registration_mode is distinct from old.registration_mode and new.registration_mode not in ('native','closed')) then raise exception 'Participation settings are locked after the first registration (you may close or reopen native registration)'; end if;
       if new.capacity is not null and new.capacity<(select count(*) from public.event_participants where event_id=new.id) then raise exception 'Capacity cannot be below current attendance'; end if;
     end if;
   end if;
 end if;
 new.updated_at:=now(); return new;
end $$;
create trigger validate_community_event before insert or update on public.events for each row execute function public.validate_community_event();

-- New installations start with no community events.
commit;

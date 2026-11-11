-- Run once in a new Supabase project's SQL editor. No sample/live event data.
begin;
create schema if not exists private;
revoke all on schema private from public;
create table private.admins (user_id uuid primary key references auth.users on delete cascade);
create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 full_name text not null check(length(full_name) between 2 and 100),
 usn text not null default '' check(length(usn)<=30),
 department text not null default '' check(length(department)<=80),
 year integer not null default 1 check(year between 1 and 4),
 bio text not null default '' check(length(bio)<=800),
 skills text[] not null default '{}' check(cardinality(skills)<=15),
 linkedin text not null default '' check(length(linkedin)<=300 and (linkedin='' or linkedin ~ '^https://(www\.)?linkedin\.com/')),
 whatsapp_acknowledged_at timestamptz,
 verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected','suspended')),
 created_at timestamptz not null default now()
);
create unique index profiles_usn_unique on public.profiles(lower(usn)) where usn<>'';
create index profiles_verification on public.profiles(verification_status,created_at desc);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from private.admins where user_id=auth.uid()) $$;
create or replace function public.is_verified() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and verification_status='verified' and whatsapp_acknowledged_at is not null) $$;
create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,full_name) values(new.id,left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Student'),100)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
create or replace function public.reverify_identity() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if (new.full_name,new.usn,new.department,new.year) is distinct from (old.full_name,old.usn,old.department,old.year) then new.verification_status:='pending'; end if;
 return new;
end $$;
create trigger identity_change before update on public.profiles for each row execute function public.reverify_identity();

create table public.events (
 id uuid primary key default gen_random_uuid(), slug text unique not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check(length(title) between 3 and 160), organizer text not null check(length(organizer) between 2 and 120),
 description text not null check(length(description) between 20 and 12000),
 mode text not null check(mode in ('online','offline','hybrid')), location text not null default '' check(length(location)<=200),
 category text not null default 'Hackathon' check(length(category)<=80),
 deadline timestamptz not null, starts_at timestamptz, ends_at timestamptz,
 apply_url text not null check(apply_url ~ '^https://'), source_url text not null check(source_url ~ '^https://'),
 eligibility text not null default '' check(length(eligibility)<=1000), prize text not null default '' check(length(prize)<=200),
 min_team integer not null default 1 check(min_team between 1 and 12), max_team integer not null default 4 check(max_team between 1 and 12 and max_team>=min_team),
 tags text[] not null default '{}' check(cardinality(tags)<=15),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 source_key text unique, verified_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or starts_at is null or ends_at>=starts_at)
);
create index events_listing on public.events(status,deadline,id);
create index events_mode on public.events(status,mode,deadline);
create index events_search on public.events using gin(to_tsvector('english',title||' '||organizer||' '||description));

create table public.saved_events(user_id uuid references public.profiles on delete cascade default auth.uid(),event_id uuid references public.events on delete cascade,created_at timestamptz default now(),primary key(user_id,event_id));
create table public.applications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade default auth.uid(),event_id uuid not null references public.events on delete cascade,status text not null default 'interested' check(status in ('interested','preparing','submitted','shortlisted','completed')),notes text not null default '' check(length(notes)<=2000),updated_at timestamptz not null default now(),unique(user_id,event_id));
create index applications_user on public.applications(user_id,updated_at desc);
create table public.teams(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles,event_id uuid references public.events on delete set null,name text not null check(length(name) between 3 and 80),description text not null check(length(description) between 10 and 1000),skills_needed text[] not null default '{}' check(cardinality(skills_needed)<=15),capacity integer not null default 4 check(capacity between 2 and 12),status text not null default 'open' check(status in ('open','closed','removed')),created_at timestamptz not null default now());
create index teams_listing on public.teams(status,created_at desc);
create table public.team_members(team_id uuid references public.teams on delete cascade,user_id uuid references public.profiles on delete cascade,joined_at timestamptz not null default now(),primary key(team_id,user_id));
create index team_members_user on public.team_members(user_id);
create table public.team_requests(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams on delete cascade,user_id uuid not null references public.profiles on delete cascade,message text not null check(length(message) between 5 and 500),status text not null default 'pending' check(status in ('pending','accepted','rejected')),created_at timestamptz not null default now(),unique(team_id,user_id));
create index team_requests_owner on public.team_requests(team_id,status,created_at);
create table public.team_messages(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams on delete cascade,user_id uuid not null references public.profiles on delete cascade default auth.uid(),body text not null check(length(body) between 1 and 2000),created_at timestamptz not null default now());
create index team_messages_page on public.team_messages(team_id,created_at desc);
create table public.announcements(id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 3 and 150),body text not null check(length(body) between 5 and 4000),created_by uuid references public.profiles default auth.uid(),created_at timestamptz not null default now());
create index announcements_page on public.announcements(created_at desc);
create table public.notification_reads(user_id uuid references public.profiles on delete cascade default auth.uid(),announcement_id uuid references public.announcements on delete cascade,primary key(user_id,announcement_id));
create table public.audit_log(id bigint generated always as identity primary key,actor_id uuid references auth.users on delete set null,action text not null,record_id text not null,created_at timestamptz default now());
create table public.ingestion_runs(id bigint generated always as identity primary key,status text not null,imported integer not null default 0,detail text not null default '',created_at timestamptz not null default now());
create table private.rate_limits(user_id uuid not null,bucket text not null,window_start timestamptz not null,hits integer not null default 1,primary key(user_id,bucket));
create or replace function public.consume_rate_limit(bucket_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare hit integer; lim integer; begin
 if auth.uid() is null or bucket_name not in ('write','message','team') then return false; end if;
 lim:=case when bucket_name='message' then 30 when bucket_name='write' then 60 else 10 end;
 insert into private.rate_limits(user_id,bucket,window_start,hits) values(auth.uid(),bucket_name,date_trunc('minute',now()),1)
 on conflict(user_id,bucket) do update set hits=case when private.rate_limits.window_start=date_trunc('minute',now()) then private.rate_limits.hits+1 else 1 end,window_start=date_trunc('minute',now()) returning hits into hit;
 return hit<=lim;
end $$;
create or replace function public.is_team_member(tid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.team_members where team_id=tid and user_id=auth.uid()) $$;
create or replace function public.owns_team(tid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.teams where id=tid and owner_id=auth.uid() and status<>'removed') $$;

-- RPCs own membership transitions. Lock the team before capacity decisions.
create or replace function public.create_team(team_name text,team_description text,needed text[],team_capacity integer,opportunity_id uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; begin
 if not public.is_verified() or not public.consume_rate_limit('team') then raise exception 'Verified membership required or rate limit reached'; end if;
 if opportunity_id is not null and not exists(select 1 from public.events where id=opportunity_id and status='published') then raise exception 'Opportunity unavailable'; end if;
 insert into public.teams(owner_id,event_id,name,description,skills_needed,capacity) values(auth.uid(),opportunity_id,team_name,team_description,needed,team_capacity) returning id into tid;
 insert into public.team_members values(tid,auth.uid(),now()); return tid;
end $$;
create or replace function public.request_team(tid uuid,introduction text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_verified() or not public.consume_rate_limit('team') then raise exception 'Verified membership required or rate limit reached'; end if;
 perform 1 from public.teams where id=tid and status='open' for update; if not found then raise exception 'Team is not open'; end if;
 if public.is_team_member(tid) then raise exception 'Already a member'; end if;
 insert into public.team_requests(team_id,user_id,message) values(tid,auth.uid(),introduction) on conflict(team_id,user_id) do update set message=excluded.message,status='pending',created_at=now();
end $$;
create or replace function public.decide_request(request_id uuid,accept_request boolean) returns void language plpgsql security definer set search_path='' as $$
declare req public.team_requests; tm public.teams; begin
 select * into req from public.team_requests where id=request_id;
 if req.id is null or not public.is_verified() then raise exception 'Request unavailable'; end if;
 select * into tm from public.teams where id=req.team_id for update;
 if tm.owner_id<>auth.uid() or tm.status='removed' then raise exception 'Only the team owner can decide'; end if;
 select * into req from public.team_requests where id=request_id for update;
 if req.status<>'pending' then raise exception 'Request already decided'; end if;
 if accept_request then
   if tm.status<>'open' or (select count(*) from public.team_members where team_id=tm.id)>=tm.capacity then raise exception 'Team is closed or full'; end if;
   if not exists(select 1 from public.profiles where id=req.user_id and verification_status='verified' and whatsapp_acknowledged_at is not null) then raise exception 'Student is no longer verified'; end if;
   insert into public.team_members(team_id,user_id) values(tm.id,req.user_id);
 end if;
 update public.team_requests set status=case when accept_request then 'accepted' else 'rejected' end where id=request_id;
end $$;
create or replace function public.leave_team(tid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.teams where id=tid for update;
 if public.owns_team(tid) then raise exception 'Owner must close the team; ownership cannot be abandoned'; end if;
 delete from public.team_members where team_id=tid and user_id=auth.uid();
end $$;
create or replace function public.acknowledge_whatsapp() returns void language plpgsql security definer set search_path='' as $$ begin update public.profiles set whatsapp_acknowledged_at=now() where id=auth.uid(); end $$;
create or replace function public.verify_student(student_id uuid,decision text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() or decision not in ('verified','rejected','suspended','pending') then raise exception 'Forbidden'; end if;
 if decision='verified' and not exists(select 1 from public.profiles where id=student_id and whatsapp_acknowledged_at is not null and usn<>'' and department<>'') then raise exception 'Student must complete onboarding first'; end if;
 update public.profiles set verification_status=decision where id=student_id;
 insert into public.audit_log(actor_id,action,record_id) values(auth.uid(),'student.'||decision,student_id::text);
end $$;
create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.audit_log(actor_id,action,record_id) values(auth.uid(),tg_table_name||'.'||lower(tg_op),coalesce(new.id,old.id)::text); return coalesce(new,old); end $$;
create trigger audit_event after insert or update or delete on public.events for each row execute function public.audit_change();
create trigger audit_announcement after insert or update or delete on public.announcements for each row execute function public.audit_change();
create trigger audit_team after update on public.teams for each row execute function public.audit_change();

-- Deny by default, including direct browser REST requests.
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.saved_events enable row level security;
alter table public.applications enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_requests enable row level security;
alter table public.team_messages enable row level security;
alter table public.announcements enable row level security;
alter table public.notification_reads enable row level security;
alter table public.audit_log enable row level security;
alter table public.ingestion_runs enable row level security;
revoke all on all tables in schema public from anon,authenticated;
grant select on public.events to anon,authenticated;
grant select on public.profiles,public.saved_events,public.applications,public.teams,public.team_members,public.team_requests,public.team_messages,public.announcements,public.notification_reads,public.audit_log,public.ingestion_runs to authenticated;
grant update(full_name,usn,department,year,bio,skills,linkedin) on public.profiles to authenticated;
grant insert,update,delete on public.events,public.announcements to authenticated;
grant insert,delete on public.saved_events,public.notification_reads to authenticated;
grant insert,update,delete on public.applications to authenticated;
grant update(status) on public.teams to authenticated;
grant insert on public.team_messages to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy event_read on public.events for select using(public.is_admin() or (status='published' and public.is_verified()));
create policy event_admin on public.events for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy saved_own on public.saved_events for all to authenticated using(user_id=auth.uid() and public.is_verified()) with check(user_id=auth.uid() and public.is_verified());
create policy application_own on public.applications for all to authenticated using(user_id=auth.uid() and public.is_verified()) with check(user_id=auth.uid() and public.is_verified());
create policy team_read on public.teams for select to authenticated using(public.is_admin() or (public.is_verified() and status<>'removed'));
create policy team_status on public.teams for update to authenticated using(public.is_admin() or (public.is_verified() and owner_id=auth.uid() and status<>'removed')) with check(public.is_admin() or (owner_id=auth.uid() and status in ('open','closed')));
create policy members_read on public.team_members for select to authenticated using(public.is_verified() or public.is_admin());
create policy requests_read on public.team_requests for select to authenticated using((public.is_verified() and (user_id=auth.uid() or public.owns_team(team_id))) or public.is_admin());
create policy messages_read on public.team_messages for select to authenticated using(public.is_verified() and public.is_team_member(team_id) and exists(select 1 from public.teams where id=team_id and status<>'removed'));
create policy messages_send on public.team_messages for insert to authenticated with check(user_id=auth.uid() and public.is_verified() and public.is_team_member(team_id) and public.consume_rate_limit('message') and exists(select 1 from public.teams where id=team_id and status<>'removed'));
create policy announcement_read on public.announcements for select to authenticated using(public.is_verified() or public.is_admin());
create policy announcement_admin on public.announcements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy read_receipt on public.notification_reads for all to authenticated using(user_id=auth.uid() and public.is_verified()) with check(user_id=auth.uid() and public.is_verified());
create policy audit_read on public.audit_log for select to authenticated using(public.is_admin());
create policy ingestion_read on public.ingestion_runs for select to authenticated using(public.is_admin());
-- Public discovery shows metadata only; details and outbound links require onboarding.
create view public.opportunity_catalog with (security_barrier=true) as select id,slug,title,organizer,mode,location,category,deadline,starts_at,prize,tags,verified_at,created_at from public.events where status='published';
grant select on public.opportunity_catalog to anon,authenticated;
create view public.student_directory with (security_barrier=true) as select id,full_name,department,year,bio,skills,linkedin from public.profiles where verification_status='verified' and (public.is_verified() or public.is_admin());
grant select on public.student_directory to authenticated;
revoke execute on all functions in schema public from public,anon;
grant execute on function public.is_admin(),public.is_verified() to anon,authenticated;
grant execute on function public.consume_rate_limit(text),public.is_team_member(uuid),public.owns_team(uuid),public.create_team(text,text,text[],integer,uuid),public.request_team(uuid,text),public.decide_request(uuid,boolean),public.leave_team(uuid),public.acknowledge_whatsapp(),public.verify_student(uuid,text) to authenticated;
-- Tighten future object defaults. Service role is reserved for CI ingestion only.
alter default privileges in schema public revoke execute on functions from public;
commit;

-- Apply after outlier/supabase/migrations/001_outlier.sql in the same project.
create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare metadata jsonb := new.raw_user_meta_data; student_year integer;
begin
  student_year := case when metadata->>'year' ~ '^[1-4]$' then (metadata->>'year')::integer else 1 end;
  insert into public.profiles(id,full_name,usn,department,year)
  values(new.id,left(coalesce(nullif(trim(metadata->>'full_name'),''),'Student'),100),
    upper(left(coalesce(trim(metadata->>'usn'),''),30)),
    left(coalesce(trim(metadata->>'department'),''),80),student_year);
  return new;
end $$;

-- Backfill accounts created before the profile table/trigger existed.
-- Existing profiles and conflicting USNs are preserved for administrator review.
insert into public.profiles (id, full_name, usn, department, year)
select u.id,
       case when length(trim(coalesce(u.raw_user_meta_data->>'full_name',''))) between 2 and 100 then trim(u.raw_user_meta_data->>'full_name') else 'Student' end,
       upper(left(trim(coalesce(u.raw_user_meta_data->>'usn','')),30)),
       left(trim(coalesce(u.raw_user_meta_data->>'department','')),80),
       case when u.raw_user_meta_data->>'year' ~ '^[1-4]$' then (u.raw_user_meta_data->>'year')::integer else 1 end
from auth.users u where not exists (select 1 from public.profiles p where p.id=u.id)
on conflict do nothing;

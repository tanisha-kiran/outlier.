-- Apply once after 003_community_events.sql to the existing project.
-- Existing profiles and registration snapshots remain associated with ASCE.
begin;
alter table public.profiles add column college text not null default 'Dr. ACS College of Engineering'
  check (length(trim(college)) between 2 and 160);
grant update(college) on public.profiles to authenticated;
drop index public.profiles_usn_unique;
create unique index profiles_college_usn_unique on public.profiles (lower(trim(college)), lower(trim(usn))) where trim(usn) <> '';

create or replace function public.create_profile() returns trigger
language plpgsql security definer set search_path='' as $$
declare metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); student_year integer; college_name text;
begin
  student_year := case when metadata->>'year' ~ '^[1-4]$' then (metadata->>'year')::integer else 1 end;
  college_name := trim(coalesce(metadata->>'college', ''));
  if length(college_name) not between 2 and 160 then college_name := 'Dr. ACS College of Engineering'; end if;
  insert into public.profiles(id,full_name,college,usn,department,year)
  values(new.id,left(coalesce(nullif(trim(metadata->>'full_name'),''),'Student'),100),college_name,
    upper(left(coalesce(trim(metadata->>'usn'),''),30)),left(coalesce(trim(metadata->>'department'),''),80),student_year);
  return new;
end $$;

create or replace function public.reverify_identity() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if (new.full_name,new.college,new.usn,new.department,new.year) is distinct from (old.full_name,old.college,old.usn,old.department,old.year) then new.verification_status:='pending'; end if;
 return new;
end $$;

-- Registration RPCs insert the student's own profile; this trigger snapshots its college.
create function public.snapshot_participant_college() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 select college into strict new.college from public.profiles where id=new.user_id;
 return new;
end $$;
create trigger participant_college_snapshot before insert on public.event_participants
for each row execute function public.snapshot_participant_college();
alter table public.event_participants drop constraint if exists event_participants_event_id_usn_key;
create unique index event_participants_college_usn_unique on public.event_participants(event_id, lower(trim(college)), lower(trim(usn)));
commit;

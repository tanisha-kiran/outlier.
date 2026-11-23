begin;
create sequence public.event_reference_sequence start 1;
alter table public.event_registrations add column reference_code text;
update public.event_registrations set reference_code='PFP-AI'||lpad(nextval('public.event_reference_sequence')::text,3,'0');
alter table public.event_registrations alter column reference_code set not null;
alter table public.event_registrations add constraint event_reference_unique unique(reference_code);
create function public.assign_event_reference() returns trigger language plpgsql security definer set search_path='' as $$ begin new.reference_code:='PFP-AI'||lpad(nextval('public.event_reference_sequence')::text,3,'0'); return new; end $$;
create trigger assign_event_reference before insert on public.event_registrations for each row execute function public.assign_event_reference();
create table public.event_invited_members(registration_id uuid not null references public.event_registrations on delete cascade, name text not null check(length(trim(name)) between 2 and 100), email text not null check(length(email)<=254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
alter table public.event_invited_members enable row level security;
revoke all on public.event_invited_members from anon,authenticated;
grant select on public.event_invited_members to authenticated;
create policy invited_members_read on public.event_invited_members for select to authenticated using(public.is_admin() or exists(select 1 from public.event_registrations r where r.id=registration_id and r.owner_id=auth.uid()));
alter function public.register_for_event(uuid,text,text,text,text,jsonb,boolean,boolean) rename to register_for_event_original;
revoke execute on function public.register_for_event_original(uuid,text,text,text,text,jsonb,boolean,boolean) from public,anon,authenticated;
create function public.register_for_event(eid uuid,kind text,team_name_input text,join_code text,phone_input text,answers_input jsonb,accept_rules boolean,allow_photos boolean,invited_members jsonb default '[]') returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; member jsonb; max_members integer;
begin
 if jsonb_typeof(invited_members) is distinct from 'array' then raise exception 'Invalid teammate details'; end if;
 select max_team into max_members from public.events where id=eid;
 if jsonb_array_length(invited_members)>greatest(coalesce(max_members,1)-1,0) or (jsonb_array_length(invited_members)>0 and (kind<>'team' or coalesce(trim(join_code),'')<>'')) then raise exception 'Optional teammate details are only for the team leader'; end if;
 rid:=public.register_for_event_original(eid,kind,team_name_input,join_code,phone_input,answers_input,accept_rules,allow_photos);
 for member in select value from jsonb_array_elements(invited_members) loop
 insert into public.event_invited_members(registration_id,name,email) values(rid,trim(member->>'name'),lower(trim(member->>'email')));
 end loop;
 return rid;
end $$;
revoke all on function public.register_for_event(uuid,text,text,text,text,jsonb,boolean,boolean,jsonb) from public,anon;
grant execute on function public.register_for_event(uuid,text,text,text,text,jsonb,boolean,boolean,jsonb) to authenticated;
commit;

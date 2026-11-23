-- Apply after 003. The abandoned local judging migration 004 is NOT required.
-- Existing native submission records are retained; new submissions use Google Forms.
begin;
alter table public.events add column submission_form_url text
 check(submission_form_url is null or (length(submission_form_url)<=2000 and submission_form_url ~ '^https://(forms[.]gle/[^[:space:]]+|docs[.]google[.]com/forms/[^[:space:]]+)$'));
create table public.event_winners (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events on delete cascade,
 place integer not null check(place between 1 and 3),
 entry_name text not null check(length(trim(entry_name)) between 2 and 100),
 project_title text not null check(length(trim(project_title)) between 3 and 160),
 project_url text check(project_url is null or (length(project_url)<=2000 and project_url ~ '^https://')),
 description text not null default '' check(length(description)<=4000),
 status text not null default 'draft' check(status in ('draft','published')),
 created_at timestamptz not null default now(), unique(event_id,place)
);
alter table public.event_winners enable row level security;
revoke all on public.event_winners from anon,authenticated;
grant select on public.event_winners to anon,authenticated;
grant insert,update,delete on public.event_winners to authenticated;
create policy winner_read on public.event_winners for select using(public.is_admin() or (status='published' and exists(select 1 from public.events e where e.id=event_id and e.is_community and e.status='published')));
create policy winner_admin on public.event_winners for all to authenticated using(public.is_admin()) with check(public.is_admin());
create trigger audit_winner after insert or update or delete on public.event_winners for each row execute function public.audit_change();
revoke execute on function public.save_event_submission(uuid,jsonb,boolean) from public,anon,authenticated;
-- If the discarded judging prototype was applied manually, retire its public APIs
-- without dropping historic records. Normally these objects do not exist.
do $$
declare signature text;
begin
 foreach signature in array array['public.judging_data(uuid)','public.assign_event_judge(uuid,text)','public.score_event_entry(uuid,uuid,text,integer[],text)','public.confirm_event_finalists(uuid,uuid[],timestamptz)','public.publish_event_winners(uuid)','public.my_demo_slot(uuid)'] loop
  if to_regprocedure(signature) is not null then execute 'revoke execute on function '||signature||' from public,anon,authenticated'; end if;
 end loop;
 if to_regclass('public.event_awards') is not null then execute 'revoke all on public.event_awards from anon,authenticated'; end if;
end $$;
commit;

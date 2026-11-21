-- Run in Supabase SQL Editor AFTER Tanisha signs up with this email and you verify
-- ownership in Authentication > Users. Never run this from the public browser.
-- This preserves existing administrators; no credentials are stored in source.
do $$
declare uid uuid;
begin
 select id into uid from auth.users where lower(email)='tanishakiran0909@gmail.com';
 if uid is null then raise exception 'Create the account first, verify its owner, then rerun this script'; end if;
 insert into private.admins(user_id) values(uid) on conflict do nothing;
end $$;

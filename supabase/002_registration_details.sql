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

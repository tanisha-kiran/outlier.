-- Keep existing references stable; use a minimum of three digits for new teams.
begin;
create or replace function public.assign_event_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare reference_number text;
begin
  reference_number := nextval('public.event_reference_sequence')::text;
  new.reference_code := 'PFP-AI' || lpad(reference_number, greatest(3, length(reference_number)), '0');
  return new;
end $$;
commit;

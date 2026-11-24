-- Permit the existing scheduler's Vault credential without exposing it to clients.
create function public.rsvp_cron_authorized(token text) returns boolean
language sql security definer set search_path='' as $$
 select token is not null and length(token)>20 and exists(
  select 1 from vault.decrypted_secrets where name='rsvp_cron_secret' and decrypted_secret=token
 );
$$;
revoke all on function public.rsvp_cron_authorized(text) from public,anon,authenticated;
grant execute on function public.rsvp_cron_authorized(text) to service_role;

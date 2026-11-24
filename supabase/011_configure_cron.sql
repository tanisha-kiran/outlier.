-- One-time server-only bootstrap of the existing Edge Function cron credential.
create function public.configure_rsvp_cron(token text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if token is null or length(token)<21 then raise exception 'Invalid cron credential'; end if;
 if exists(select 1 from vault.secrets where name='rsvp_cron_secret') then raise exception 'Cron credential already configured'; end if;
 perform vault.create_secret(token,'rsvp_cron_secret','OUTLIER registration email scheduler');
end $$;
revoke all on function public.configure_rsvp_cron(text) from public,anon,authenticated;
grant execute on function public.configure_rsvp_cron(text) to service_role;

-- Allow sign-in by planeswalker name (display_name).
-- This function runs with SECURITY DEFINER so it can read auth.users
-- without exposing emails publicly via RLS.
create or replace function public.get_email_by_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.display_name) = lower(trim(p_display_name))
  limit 1;
  return v_email; -- NULL if not found
end;
$$;

-- Restrict execution to authenticated callers and the anon role
-- (anon is needed because sign-in happens before auth)
grant execute on function public.get_email_by_display_name(text) to anon, authenticated;

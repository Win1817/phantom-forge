-- Improved version: checks profiles table first, then falls back to
-- raw_user_meta_data in auth.users. This handles accounts created before
-- the profiles trigger existed, or where display_name was set in metadata
-- but not yet synced to profiles.
create or replace function public.get_email_by_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  -- Primary: profiles table (kept in sync by Settings page)
  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.display_name) = lower(trim(p_display_name))
  limit 1;

  -- Fallback: raw_user_meta_data (covers older accounts / OAuth signups)
  if v_email is null then
    select email into v_email
    from auth.users
    where lower(raw_user_meta_data->>'display_name') = lower(trim(p_display_name))
    limit 1;
  end if;

  return v_email;
end;
$$;

grant execute on function public.get_email_by_display_name(text) to anon, authenticated;

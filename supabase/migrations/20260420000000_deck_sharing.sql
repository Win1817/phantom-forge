-- Add deck sharing support
alter table public.decks
  add column if not exists is_public boolean not null default false,
  add column if not exists share_token text unique;

-- Generate a unique share token using replace(gen_random_uuid()) — no encoding needed
create or replace function public.generate_share_token()
returns trigger language plpgsql as $$
begin
  if new.share_token is null then
    new.share_token := replace(gen_random_uuid()::text, '-', '');
  end if;
  return new;
end;
$$;

create trigger decks_share_token
  before insert on public.decks
  for each row execute function public.generate_share_token();

-- Back-fill tokens for existing decks
update public.decks
set share_token = replace(gen_random_uuid()::text, '-', '')
where share_token is null;

-- Allow anyone to read public decks
create policy "Public decks are viewable by anyone"
  on public.decks for select
  using (is_public = true);

-- Allow anyone to read cards of public decks
create policy "Public deck cards are viewable by anyone"
  on public.deck_cards for select
  using (
    exists (
      select 1 from public.decks d
      where d.id = deck_id and d.is_public = true
    )
  );

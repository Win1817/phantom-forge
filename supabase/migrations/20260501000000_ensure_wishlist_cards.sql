-- Idempotent: creates wishlist_cards if it doesn't exist yet.
-- Run this if the earlier 20260419 migration was never applied.

create table if not exists public.wishlist_cards (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  scryfall_id text        not null,
  card_name   text        not null,
  image_url   text,
  price_usd   numeric,
  rarity      text,
  set_name    text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Enable RLS (no-op if already enabled)
alter table public.wishlist_cards enable row level security;

-- Policies — drop first so re-running is safe
do $$ begin
  drop policy if exists "Users view own wishlist"   on public.wishlist_cards;
  drop policy if exists "Users insert own wishlist" on public.wishlist_cards;
  drop policy if exists "Users delete own wishlist" on public.wishlist_cards;
end $$;

create policy "Users view own wishlist"
  on public.wishlist_cards for select
  using (auth.uid() = user_id);

create policy "Users insert own wishlist"
  on public.wishlist_cards for insert
  with check (auth.uid() = user_id);

create policy "Users delete own wishlist"
  on public.wishlist_cards for delete
  using (auth.uid() = user_id);

-- Index (idempotent)
create index if not exists wishlist_cards_user_id_idx
  on public.wishlist_cards (user_id);

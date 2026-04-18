create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by owner" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.collection_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scryfall_id text not null,
  card_name text not null,
  set_code text,
  set_name text,
  collector_number text,
  rarity text,
  mana_cost text,
  type_line text,
  colors text[],
  cmc numeric,
  image_url text,
  price_usd numeric,
  quantity integer not null default 1,
  foil boolean not null default false,
  condition text default 'NM',
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.collection_cards enable row level security;
create policy "Users view own cards" on public.collection_cards for select using (auth.uid() = user_id);
create policy "Users insert own cards" on public.collection_cards for insert with check (auth.uid() = user_id);
create policy "Users update own cards" on public.collection_cards for update using (auth.uid() = user_id);
create policy "Users delete own cards" on public.collection_cards for delete using (auth.uid() = user_id);
create index collection_cards_user_id_idx on public.collection_cards(user_id);
create index collection_cards_name_idx on public.collection_cards(card_name);
create trigger collection_cards_set_updated_at before update on public.collection_cards
  for each row execute function public.set_updated_at();

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format text not null default 'casual',
  description text,
  colors text[],
  cover_image_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);
alter table public.decks enable row level security;
create policy "Users view own decks" on public.decks for select using (auth.uid() = user_id);
create policy "Users insert own decks" on public.decks for insert with check (auth.uid() = user_id);
create policy "Users update own decks" on public.decks for update using (auth.uid() = user_id);
create policy "Users delete own decks" on public.decks for delete using (auth.uid() = user_id);
create trigger decks_set_updated_at before update on public.decks
  for each row execute function public.set_updated_at();

create table public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  scryfall_id text not null,
  card_name text not null,
  image_url text,
  mana_cost text,
  cmc numeric,
  type_line text,
  colors text[],
  quantity integer not null default 1,
  is_sideboard boolean not null default false,
  is_commander boolean not null default false,
  created_at timestamptz default now() not null
);
alter table public.deck_cards enable row level security;
create policy "Users view own deck cards" on public.deck_cards for select using (
  exists(select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
);
create policy "Users insert own deck cards" on public.deck_cards for insert with check (
  exists(select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
);
create policy "Users update own deck cards" on public.deck_cards for update using (
  exists(select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
);
create policy "Users delete own deck cards" on public.deck_cards for delete using (
  exists(select 1 from public.decks d where d.id = deck_id and d.user_id = auth.uid())
);
create index deck_cards_deck_id_idx on public.deck_cards(deck_id);
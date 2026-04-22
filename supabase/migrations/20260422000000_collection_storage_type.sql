-- Add storage_type to collection_cards
-- 'arcane'  = digital/virtual (Arena, MTGO, online)
-- 'vault'   = physical card you physically own
alter table public.collection_cards
  add column if not exists storage_type text not null default 'vault'
  check (storage_type in ('arcane', 'vault'));

create index if not exists collection_cards_storage_type_idx
  on public.collection_cards(user_id, storage_type);

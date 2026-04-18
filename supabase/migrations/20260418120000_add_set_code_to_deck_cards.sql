-- Add set_code and collector_number columns to deck_cards
-- These are needed for Arena/MTGO format deck export/import

alter table public.deck_cards
  add column if not exists set_code text,
  add column if not exists collector_number text;

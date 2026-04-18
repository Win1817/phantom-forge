// Lightweight Scryfall client (no API key required).
const BASE = "https://api.scryfall.com";

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  rarity?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  image_uris?: { small?: string; normal?: string; large?: string; art_crop?: string };
  card_faces?: { image_uris?: { small?: string; normal?: string; large?: string } }[];
  prices?: { usd?: string | null; usd_foil?: string | null };
  scryfall_uri?: string;
}

export function getCardImage(card: ScryfallCard): string | null {
  return card.image_uris?.normal || card.image_uris?.large || card.image_uris?.small ||
    card.card_faces?.[0]?.image_uris?.normal || card.card_faces?.[0]?.image_uris?.large || null;
}

export async function searchCards(query: string, page = 1): Promise<{ data: ScryfallCard[]; total: number; hasMore: boolean }> {
  if (!query.trim()) return { data: [], total: 0, hasMore: false };
  const url = `${BASE}/cards/search?q=${encodeURIComponent(query)}&page=${page}`;
  const res = await fetch(url);
  if (res.status === 404) return { data: [], total: 0, hasMore: false };
  if (!res.ok) throw new Error(`Scryfall error ${res.status}`);
  const json = await res.json();
  return { data: json.data ?? [], total: json.total_cards ?? 0, hasMore: !!json.has_more };
}

export async function autocomplete(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const res = await fetch(`${BASE}/cards/autocomplete?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
}

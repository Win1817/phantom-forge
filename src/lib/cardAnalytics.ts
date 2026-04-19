/**
 * cardAnalytics.ts — Pure-math card analysis engine.
 *
 * Replaces AI for:
 *   - Role classification    (keyword regex on oracle text)
 *   - Related card lookup    (Scryfall color + type search)
 *   - Combo detection        (CommanderSpellbook API)
 *   - Mana curve analysis    (arithmetic)
 *
 * AI is still used for: plain-English explanation, gameplay tips.
 */

import type { ScryfallCard } from "./scryfall";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CardRole =
  | "ramp"
  | "removal"
  | "draw"
  | "counter"
  | "finisher"
  | "support"
  | "threat"
  | "utility"
  | "lands"
  | "combo";

export interface ComboResult {
  cards: string[];
  result: string;
  steps?: string[];
}

// ─── Role Classifier ─────────────────────────────────────────────────────────

const ROLE_PATTERNS: [CardRole, RegExp][] = [
  // Lands first — type line wins
  ["lands",    /\bland\b/i],
  // Counter
  ["counter",  /counter target (spell|ability|creature|permanent)/i],
  // Removal — destruction or exile of permanents
  ["removal",  /(destroy|exile) target (creature|permanent|artifact|enchantment|planeswalker)/i],
  // Removal — damage-based
  ["removal",  /deals? \d+ damage to (any target|target creature|each creature)/i],
  // Ramp — mana production
  ["ramp",     /add (\{[WUBRGC]\}|one mana of any)/i],
  ["ramp",     /search your library for (a |up to \d+ )?(basic )?land/i],
  ["ramp",     /put (a |that )?land (card )?onto the battlefield/i],
  // Draw
  ["draw",     /draw (a card|cards|two|three|four|x cards)/i],
  // Combo — infinite or triggered loops
  ["combo",    /(untap|infinite|loop|whenever .+ deals combat damage|storm)/i],
  // Finisher — explicit win conditions
  ["finisher", /(win(s)? the game|you win|players? lose)/i],
  // Finisher — evasive high-power creatures (checked later with stats)
  // Support — buff / protect
  ["support",  /(\+\d+\/\+\d+|hexproof|indestructible|protection from)/i],
  // Threat — large bodies (CMC ≥ 5, has power/toughness) — fallback below
  // Utility — default
];

/**
 * Classify a card's primary role using oracle text and stats.
 * No network calls — pure pattern matching.
 */
export function classifyRole(card: {
  oracle_text?: string;
  type_line?: string;
  power?: string;
  toughness?: string;
  cmc?: number;
  keywords?: string[];
}): CardRole {
  const oracle = card.oracle_text ?? "";
  const type = card.type_line ?? "";

  // Lands first
  if (/\bland\b/i.test(type)) return "lands";

  // Iterate patterns
  for (const [role, regex] of ROLE_PATTERNS) {
    if (role === "lands") continue; // already handled
    if (regex.test(oracle)) return role;
  }

  // Heuristic: large creature (CMC ≥ 4, power ≥ 4) → threat
  const power = parseInt(card.power ?? "0", 10);
  const cmc = card.cmc ?? 0;
  if (!isNaN(power) && power >= 4 && cmc >= 4) return "threat";

  return "utility";
}

// ─── Related Cards (Scryfall) ─────────────────────────────────────────────────

const relatedCache = new Map<string, string[]>();

/**
 * Find related cards via Scryfall search.
 * Matches by color identity, type, and primary keyword.
 */
export async function findRelatedCards(card: {
  name: string;
  colors?: string[];
  type_line?: string;
  oracle_text?: string;
}, limit = 5): Promise<string[]> {
  if (relatedCache.has(card.name)) return relatedCache.get(card.name)!;

  try {
    const colorQuery = card.colors?.length
      ? `c<=${card.colors.join("")}`
      : "";

    // Extract first meaningful type
    const typeParts = (card.type_line ?? "").split("—")[0].trim().split(/\s+/);
    const subType = typeParts[typeParts.length - 1] ?? "";
    const typeQuery = subType && subType !== "—" ? `t:${subType}` : "";

    // Pick a keyword from oracle text for relevance
    let keywordQuery = "";
    for (const [, regex] of ROLE_PATTERNS) {
      if (regex.test(card.oracle_text ?? "")) {
        // Extract a safe substring for the query
        const match = (card.oracle_text ?? "").match(regex);
        if (match) {
          keywordQuery = `o:"${match[0].slice(0, 20).replace(/"/g, "")}"`;
          break;
        }
      }
    }

    const parts = [colorQuery, typeQuery, keywordQuery, `-!"${card.name}"`, "order:edhrec"].filter(Boolean);
    const q = parts.join(" ");

    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&page=1`
    );
    if (!res.ok) return [];

    const json = await res.json();
    const names: string[] = (json.data ?? [])
      .slice(0, limit)
      .map((c: ScryfallCard) => c.name);

    relatedCache.set(card.name, names);
    return names;
  } catch {
    return [];
  }
}

// ─── Combo Lookup (CommanderSpellbook) ───────────────────────────────────────

const comboCache = new Map<string, ComboResult[]>();

/**
 * Look up known combos for a card via the CommanderSpellbook API.
 * Returns up to 3 combos as human-readable strings.
 */
export async function findCombos(cardName: string, limit = 3): Promise<string[]> {
  if (comboCache.has(cardName)) {
    return comboCache.get(cardName)!.map(formatCombo);
  }

  try {
    const encoded = encodeURIComponent(`card:"${cardName}"`);
    const res = await fetch(
      `https://backend.commanderspellbook.com/variants/?q=${encoded}&limit=${limit}`
    );
    if (!res.ok) return [];

    const json = await res.json();
    const results: ComboResult[] = (json.results ?? []).map((v: {
      uses?: Array<{ card?: { name?: string } }>;
      produces?: Array<{ feature?: { name?: string } }>;
    }) => ({
      cards: (v.uses ?? []).map((u) => u.card?.name ?? "").filter(Boolean),
      result: (v.produces ?? []).map((p) => p.feature?.name ?? "").filter(Boolean).join(", "),
    }));

    comboCache.set(cardName, results);
    return results.map(formatCombo);
  } catch {
    return [];
  }
}

function formatCombo(c: ComboResult): string {
  const cardList = c.cards.slice(0, 3).join(" + ");
  return c.result ? `${cardList} → ${c.result}` : cardList;
}

// ─── Mana Curve Analysis ─────────────────────────────────────────────────────

export interface CurveStats {
  /** Histogram: CMC → card count */
  histogram: Record<number, number>;
  /** Average CMC across all non-land cards */
  avgCmc: number;
  /** Ideal land count based on avg CMC (Frank Karsten formula) */
  suggestedLands: number;
}

export function analyzeCurve(
  cards: Array<{ cmc?: number; quantity: number; type_line?: string }>
): CurveStats {
  const histogram: Record<number, number> = {};
  let totalCmc = 0;
  let totalNonLand = 0;

  for (const card of cards) {
    if (/\bland\b/i.test(card.type_line ?? "")) continue;
    const cmc = card.cmc ?? 0;
    const qty = card.quantity ?? 1;
    histogram[cmc] = (histogram[cmc] ?? 0) + qty;
    totalCmc += cmc * qty;
    totalNonLand += qty;
  }

  const avgCmc = totalNonLand > 0 ? totalCmc / totalNonLand : 0;

  // Karsten approximation: lands ≈ 31.5 + 3.14 × avgCmc (Commander 99)
  // Clamp between 33 and 40
  const suggestedLands = Math.round(Math.min(40, Math.max(33, 31.5 + 3.14 * avgCmc)));

  return { histogram, avgCmc, suggestedLands };
}

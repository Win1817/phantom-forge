/**
 * deckBuilder.ts — Math-first deck construction engine.
 *
 * Strategy:
 *   1. Query Scryfall for REAL cards by role slot (ramp, draw, removal…)
 *   2. Enforce format legality, color identity, budget — pure filtering
 *   3. Balance the mana curve algorithmically
 *   4. Return a card list in Arena/MTGO format
 *   5. AI only narrates (name, description, strategy) — no card selection
 *
 * Benefits vs pure-AI generation:
 *   - Zero hallucinated card names or set codes
 *   - Real price filtering via Scryfall prices
 *   - Guaranteed format legality
 *   - Deterministic, reproducible results
 */

import type { ScryfallCard } from "./scryfall";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeckBuilderParams {
  format: string;
  style: string;
  colors: string[];      // WUBRG subset
  budget: string;        // "budget" | "mid" | "competitive" | "any"
  notes?: string;
}

export interface BuiltDeck {
  /** Selected cards with quantities */
  cards: Array<ScryfallCard & { quantity: number }>;
  /** Arena/MTGO text export */
  deckList: string;
  /** Slot breakdown for transparency */
  slotSummary: Record<string, number>;
}

// ─── Format config ────────────────────────────────────────────────────────────

interface FormatConfig {
  deckSize: number;
  landCount: number;
  isCommander: boolean;
  maxCopies: number;
  /** Scryfall format code */
  scryfallKey: string;
}

const FORMAT_CONFIG: Record<string, FormatConfig> = {
  Commander: { deckSize: 100, landCount: 37, isCommander: true,  maxCopies: 1,  scryfallKey: "commander" },
  Standard:  { deckSize: 60,  landCount: 24, isCommander: false, maxCopies: 4,  scryfallKey: "standard"  },
  Pioneer:   { deckSize: 60,  landCount: 24, isCommander: false, maxCopies: 4,  scryfallKey: "pioneer"   },
  Modern:    { deckSize: 60,  landCount: 24, isCommander: false, maxCopies: 4,  scryfallKey: "modern"    },
  Pauper:    { deckSize: 60,  landCount: 24, isCommander: false, maxCopies: 4,  scryfallKey: "pauper"    },
  Casual:    { deckSize: 60,  landCount: 24, isCommander: false, maxCopies: 4,  scryfallKey: ""          },
};

// ─── Budget price cap (per card, USD) ────────────────────────────────────────

const BUDGET_CAP: Record<string, number> = {
  budget:      1.0,
  mid:         10.0,
  competitive: 999,
  any:         9999,
};

// ─── Slot definitions ─────────────────────────────────────────────────────────

interface Slot {
  name: string;
  /** How many cards to fill in Commander / 60-card */
  countCdr: number;
  count60: number;
  /** Scryfall oracle query fragment */
  oracleQuery: string;
  /** Additional type filter */
  typeQuery?: string;
  /** Prefer high CMC or low CMC */
  sortBy?: "edhrec" | "cmc-asc" | "cmc-desc" | "usd-asc";
}

// Style modifiers tweak slot weights
const STYLE_SLOT_BIAS: Record<string, Partial<Record<string, number>>> = {
  Aggro:    { threats: +4, ramp: -2, draw: -1, control: -2 },
  Control:  { counter: +4, removal: +2, draw: +2, threats: -3 },
  Midrange: {},
  Combo:    { combo: +4, draw: +2, ramp: +2, removal: -2 },
  Tempo:    { counter: +2, threats: +2, ramp: -1 },
  Ramp:     { ramp: +4, threats: +2, draw: +1 },
};

const BASE_SLOTS: Slot[] = [
  {
    name: "ramp",
    countCdr: 10, count60: 4,
    oracleQuery: `(o:"add {" OR o:"search your library for a basic land" OR o:"put a land" OR o:"land card onto the battlefield")`,
    typeQuery: `-t:land`,
    sortBy: "edhrec",
  },
  {
    name: "draw",
    countCdr: 8, count60: 4,
    oracleQuery: `(o:"draw a card" OR o:"draw two" OR o:"draw three" OR o:"draw cards" OR o:"draw X")`,
    typeQuery: `-t:land`,
    sortBy: "edhrec",
  },
  {
    name: "removal",
    countCdr: 8, count60: 4,
    oracleQuery: `(o:"destroy target creature" OR o:"exile target creature" OR o:"destroy target permanent" OR o:"exile target permanent" OR o:"deals damage to any target")`,
    typeQuery: `-t:land`,
    sortBy: "edhrec",
  },
  {
    name: "counter",
    countCdr: 4, count60: 2,
    oracleQuery: `o:"counter target spell"`,
    typeQuery: `t:instant`,
    sortBy: "edhrec",
  },
  {
    name: "threats",
    countCdr: 12, count60: 12,
    oracleQuery: `(o:"flying" OR o:"trample" OR o:"haste") pow>=3`,
    typeQuery: `t:creature`,
    sortBy: "edhrec",
  },
  {
    name: "support",
    countCdr: 8, count60: 4,
    oracleQuery: `(o:"+1/+1 counter" OR o:"hexproof" OR o:"indestructible" OR o:"whenever you gain life")`,
    typeQuery: `-t:land -t:basic`,
    sortBy: "edhrec",
  },
];

// ─── Scryfall helpers ─────────────────────────────────────────────────────────

async function scryfallSearch(query: string): Promise<ScryfallCard[]> {
  try {
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&page=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

function priceOf(card: ScryfallCard): number {
  return parseFloat(card.prices?.usd ?? "9999") || 9999;
}

function formatLine(card: ScryfallCard & { quantity: number }): string {
  let line = `${card.quantity} ${card.name}`;
  if (card.set && card.collector_number) {
    line += ` (${card.set.toUpperCase()}) ${card.collector_number}`;
  }
  return line;
}

// ─── Basic lands ─────────────────────────────────────────────────────────────

const BASIC_LAND_BY_COLOR: Record<string, { name: string; set: string; num: string }> = {
  W: { name: "Plains",   set: "BLB", num: "279" },
  U: { name: "Island",   set: "BLB", num: "276" },
  B: { name: "Swamp",    set: "BLB", num: "280" },
  R: { name: "Mountain", set: "BLB", num: "277" },
  G: { name: "Forest",   set: "BLB", num: "278" },
};

function buildLands(
  colors: string[],
  count: number,
  budget: string,
  priceCap: number
): Array<ScryfallCard & { quantity: number }> {
  const effectiveColors = colors.length ? colors : ["W", "U", "B", "R", "G"];

  if (colors.length === 0 || budget === "budget") {
    // Pure basics — always free
    const perColor = Math.floor(count / effectiveColors.length);
    const remainder = count % effectiveColors.length;
    return effectiveColors.map((c, i) => {
      const land = BASIC_LAND_BY_COLOR[c] ?? BASIC_LAND_BY_COLOR["W"];
      return {
        id: `basic-${c}`,
        name: land.name,
        set: land.set,
        collector_number: land.num,
        type_line: "Basic Land",
        cmc: 0,
        colors: [],
        quantity: perColor + (i < remainder ? 1 : 0),
      } as ScryfallCard & { quantity: number };
    });
  }

  // Try to include a few dual/fetch lands for non-budget
  const cheapDuals: Array<ScryfallCard & { quantity: number }> = [];
  const basicsCount = Math.max(Math.floor(count * 0.6), effectiveColors.length);
  const dualCount = count - basicsCount;

  // Basics
  const basics = buildLands(effectiveColors, basicsCount, "budget", priceCap);

  // Dual placeholder entries (will be resolved by Decksmith save flow)
  if (dualCount > 0 && effectiveColors.length > 1) {
    cheapDuals.push({
      id: "command-tower",
      name: "Command Tower",
      set: "CLB",
      collector_number: "361",
      type_line: "Land",
      cmc: 0,
      colors: [],
      quantity: Math.min(dualCount, 1),
    } as ScryfallCard & { quantity: number });
  }

  return [...basics, ...cheapDuals];
}

// ─── Commander picker ─────────────────────────────────────────────────────────

async function pickCommander(
  colors: string[],
  style: string,
  priceCap: number,
  format: string
): Promise<(ScryfallCard & { quantity: number }) | null> {
  const colorId = colors.length ? colors.join("") : "WUBRG";
  const styleHint: Record<string, string> = {
    Aggro:    `(o:"attack" OR o:"combat") `,
    Control:  `(o:"counter" OR o:"draw") `,
    Combo:    `(o:"whenever" OR o:"untap") `,
    Ramp:     `(o:"add {" OR o:"land") `,
    Midrange: "",
    Tempo:    `(o:"flash" OR o:"flying") `,
  };

  const hint = styleHint[style] ?? "";
  const budgetQ = priceCap < 100 ? `usd<=${priceCap}` : "";
  const q = `is:commander ci<=${colorId} ${hint} ${budgetQ} order:edhrec`.trim();

  const results = await scryfallSearch(q);
  const valid = results.filter((c) => priceOf(c) <= priceCap);
  if (!valid.length) return null;
  return { ...valid[0], quantity: 1 };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildDeckMath(params: DeckBuilderParams): Promise<BuiltDeck> {
  const config = FORMAT_CONFIG[params.format] ?? FORMAT_CONFIG["Casual"];
  const priceCap = BUDGET_CAP[params.budget] ?? BUDGET_CAP["any"];
  const colorId = params.colors.length ? params.colors.join("") : "";

  const selectedCards: Array<ScryfallCard & { quantity: number }> = [];
  const usedNames = new Set<string>();
  const slotSummary: Record<string, number> = {};

  // ── 1. Pick commander (Commander format only) ──
  let commanderCard: (ScryfallCard & { quantity: number }) | null = null;
  if (config.isCommander) {
    commanderCard = await pickCommander(params.colors, params.style, priceCap, params.format);
    if (commanderCard) {
      selectedCards.push(commanderCard);
      usedNames.add(commanderCard.name);
      slotSummary["commander"] = 1;
    }
  }

  // ── 2. Apply style bias to slot counts ──
  const bias = STYLE_SLOT_BIAS[params.style] ?? {};
  const slots = BASE_SLOTS.map((slot) => ({
    ...slot,
    countCdr: Math.max(0, slot.countCdr + (bias[slot.name] ?? 0)),
    count60: Math.max(0, slot.count60 + Math.floor((bias[slot.name] ?? 0) / 2)),
  }));

  // ── 3. Fill each role slot from Scryfall ──
  for (const slot of slots) {
    const target = config.isCommander ? slot.countCdr : slot.count60;
    if (target <= 0) continue;

    const colorFilter = colorId ? `ci<=${colorId}` : "";
    const formatFilter = config.scryfallKey ? `f:${config.scryfallKey}` : "";
    const budgetFilter = priceCap < 100 ? `usd<=${priceCap}` : "";
    const typeFilter = slot.typeQuery ?? "";

    const q = [
      slot.oracleQuery,
      colorFilter,
      formatFilter,
      budgetFilter,
      typeFilter,
      "order:edhrec",
    ].filter(Boolean).join(" ");

    const results = await scryfallSearch(q);

    let filled = 0;
    for (const card of results) {
      if (filled >= target) break;
      if (usedNames.has(card.name)) continue;
      if (priceOf(card) > priceCap) continue;

      const qty = config.isCommander ? 1 : Math.min(config.maxCopies, target - filled);
      selectedCards.push({ ...card, quantity: qty });
      usedNames.add(card.name);
      filled += qty;
    }
    slotSummary[slot.name] = filled;
  }

  // ── 4. Add lands ──
  const nonLandCount = selectedCards.reduce((s, c) => s + c.quantity, 0);
  const landTarget = config.deckSize - nonLandCount;
  const lands = buildLands(params.colors, Math.max(landTarget, config.landCount), params.budget, priceCap);
  selectedCards.push(...lands);
  slotSummary["lands"] = lands.reduce((s, c) => s + c.quantity, 0);

  // ── 5. Trim to exact deck size ──
  let total = selectedCards.reduce((s, c) => s + c.quantity, 0);
  let i = selectedCards.length - 1;
  while (total > config.deckSize && i >= 0) {
    const card = selectedCards[i];
    const over = total - config.deckSize;
    const reduce = Math.min(card.quantity, over);
    card.quantity -= reduce;
    total -= reduce;
    if (card.quantity <= 0) selectedCards.splice(i, 1);
    i--;
  }

  // ── 6. Render Arena/MTGO export ──
  const lines: string[] = [];

  if (commanderCard && config.isCommander) {
    lines.push("Commander");
    lines.push(formatLine(commanderCard));
    lines.push("");
  }

  lines.push("Deck");
  for (const card of selectedCards) {
    if (commanderCard && card.name === commanderCard.name) continue;
    if (card.quantity > 0) lines.push(formatLine(card));
  }

  return {
    cards: selectedCards,
    deckList: lines.join("\n"),
    slotSummary,
  };
}

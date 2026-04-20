/**
 * deckBuilder.ts — Math-first deck construction engine.
 *
 * Strategy:
 *   1. Query Scryfall for REAL cards by role slot (ramp, draw, removal…)
 *   2. Enforce format legality, color identity, budget — pure filtering
 *   3. Balance the mana curve algorithmically
 *   4. Return a card list in Arena/MTGO format
 *   5. AI only narrates (name, description, strategy) — no card selection
 */

import type { ScryfallCard } from "./scryfall";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeckBuilderParams {
  format: string;
  style: string;
  colors: string[];
  budget: string;
  notes?: string;
  collectionCards?: CollectionCard[];
  useCollection?: boolean;
}

export interface CollectionCard {
  scryfall_id: string;
  card_name: string;
  set_code: string | null;
  collector_number: string | null;
  mana_cost: string | null;
  type_line: string | null;
  colors: string[] | null;
  cmc: number | null;
  quantity: number;
  oracle_text?: string;
}

export interface BuiltDeck {
  cards: Array<ScryfallCard & { quantity: number }>;
  deckList: string;
  slotSummary: Record<string, number>;
}

// ─── Format config ────────────────────────────────────────────────────────────

interface FormatConfig {
  deckSize: number;
  landCount: number;
  isCommander: boolean;
  maxCopies: number;
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

// ─── Budget price cap ─────────────────────────────────────────────────────────

const BUDGET_CAP: Record<string, number> = {
  budget:      1.0,
  mid:         10.0,
  competitive: 999,
  any:         9999,
};

// ─── Slot definitions ─────────────────────────────────────────────────────────
// count60 values now sum to exactly 36 (60 - 24 lands)
// countCdr values sum to exactly 63 (100 - 37 lands)

interface Slot {
  name: string;
  countCdr: number;
  count60: number;
  oracleQuery: string;
  typeQuery?: string;
  sortBy?: string;
}

const BASE_SLOTS: Slot[] = [
  {
    name: "ramp",
    countCdr: 12, count60: 6,
    oracleQuery: `(o:"add {" OR o:"search your library for a basic land" OR o:"put a land" OR o:"land card onto the battlefield")`,
    typeQuery: `-t:land`,
  },
  {
    name: "draw",
    countCdr: 10, count60: 6,
    oracleQuery: `(o:"draw a card" OR o:"draw two" OR o:"draw three" OR o:"draw cards" OR o:"draw X")`,
    typeQuery: `-t:land`,
  },
  {
    name: "removal",
    countCdr: 10, count60: 6,
    oracleQuery: `(o:"destroy target creature" OR o:"exile target creature" OR o:"destroy target permanent" OR o:"exile target permanent" OR o:"deals damage to any target")`,
    typeQuery: `-t:land`,
  },
  {
    name: "counter",
    countCdr: 5, count60: 2,
    oracleQuery: `o:"counter target spell"`,
    typeQuery: `t:instant`,
  },
  {
    name: "threats",
    countCdr: 20, count60: 14,
    oracleQuery: `(o:"flying" OR o:"trample" OR o:"haste") pow>=3`,
    typeQuery: `t:creature`,
  },
  {
    name: "support",
    countCdr: 5, count60: 2,
    oracleQuery: `(o:"+1/+1 counter" OR o:"hexproof" OR o:"indestructible" OR o:"whenever you gain life")`,
    typeQuery: `-t:land -t:basic`,
  },
];

// Style modifiers — keep totals balanced
const STYLE_SLOT_BIAS: Record<string, Partial<Record<string, number>>> = {
  Aggro:    { threats: +4, ramp: -2, draw: -1, counter: -1 },
  Control:  { counter: +3, removal: +2, draw: +2, threats: -4, ramp: -1, support: -2 },
  Midrange: {},
  Combo:    { draw: +3, ramp: +2, counter: +1, threats: -3, support: -1, removal: -2 },
  Tempo:    { counter: +2, threats: +2, ramp: -2, support: -2 },
  Ramp:     { ramp: +4, threats: +2, draw: +1, counter: -3, support: -2, removal: -2 },
};

// ─── Scryfall helpers ─────────────────────────────────────────────────────────

async function scryfallSearch(query: string, pages = 1): Promise<ScryfallCard[]> {
  const results: ScryfallCard[] = [];
  try {
    for (let page = 1; page <= pages; page++) {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=edhrec&page=${page}`;
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      results.push(...(json.data ?? []));
      if (!json.has_more) break;
      // Small delay to respect Scryfall rate limits
      await new Promise((r) => setTimeout(r, 80));
    }
  } catch {
    // ignore
  }
  return results;
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
): Array<ScryfallCard & { quantity: number }> {
  if (count <= 0) return [];
  const effectiveColors = colors.length ? colors : ["W", "U", "B", "R", "G"];
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

// ─── Commander picker ─────────────────────────────────────────────────────────

async function pickCommander(
  colors: string[],
  style: string,
  priceCap: number,
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
  const results = await scryfallSearch(q, 1);
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

  // ── 0. Collection lookup ──
  const collectionMap = new Map<string, CollectionCard>();
  if (params.useCollection && params.collectionCards?.length) {
    for (const c of params.collectionCards) {
      collectionMap.set(c.card_name.toLowerCase(), c);
    }
  }

  // Slot keyword hints for type-line matching (oracle_text not stored in collection)
  const SLOT_TYPE_HINTS: Record<string, { types?: string[]; nameParts?: string[] }> = {
    ramp:     { types: ["land"], nameParts: ["sol ring","mana crypt","signet","talisman","lotus","diamond","vault","monolith","dynamo","sphere","vessel","archive","hedron","compass","map","pilgrim","mystic","birds","llanowar","fyndhorn","elvish","cultivate","kodama","farseek","rampant","nature's lore","three visits","growth spiral"] },
    draw:     { nameParts: ["rhystic","remora","skullclamp","henge","divining","crystal","brainstorm","ponder","preordain","opt","consider","windfall","wheel","fact or fiction","treasure cruise","dig through time","consecrated","ledger","toski","ohran","beast whisperer","guardian project"] },
    removal:  { nameParts: ["swords","path to exile","doom blade","murder","terminate","dreadbore","anguished","assassin","chaos warp","generous gift","beast within","toxic deluge","damnation","blasphemous","cyclonic","abrupt","sweltering"] },
    counter:  { types: ["instant"], nameParts: ["counterspell","negate","swan song","mana drain","force of will","force of negation","fierce","arcane denial","flusterstorm","pact"] },
    threats:  { types: ["creature","planeswalker"] },
    support:  { types: ["enchantment","artifact"], nameParts: ["smothering","anointed","parallel","hardened","primal vigor","mirari","mana reflection","zendikar resurgent"] },
  };

  function matchesSlot(card: CollectionCard, slotName: string): boolean {
    const hints = SLOT_TYPE_HINTS[slotName];
    if (!hints) return false;

    const typeLine = (card.type_line ?? "").toLowerCase();
    const cardName = card.card_name.toLowerCase();

    // Name-based match (highest fidelity — covers well-known staples)
    if (hints.nameParts?.some((p) => cardName.includes(p))) return true;

    // Type-based match (broad — creatures go to threats, instants to counter, etc.)
    if (hints.types?.some((t) => typeLine.includes(t))) {
      // Exclude lands from non-ramp slots
      if (slotName !== "ramp" && typeLine.includes("land")) return false;
      // Only put creatures in threats if they're not better elsewhere
      if (slotName === "threats") return typeLine.includes("creature") || typeLine.includes("planeswalker");
      return true;
    }

    return false;
  }

  function colorMatches(card: CollectionCard): boolean {
    // No color restriction — all cards allowed
    if (!colorId || params.colors.length === 0) return true;
    const cardColors = card.colors ?? [];
    // Colorless cards (artifacts, lands) always fit any color identity
    if (cardColors.length === 0) return true;
    // All card colors must be within the chosen color identity
    return cardColors.every((c) => colorId.includes(c));
  }

  // ── 1. Commander ──
  let commanderCard: (ScryfallCard & { quantity: number }) | null = null;
  if (config.isCommander) {
    // Try collection first — pick a legendary creature that fits color identity
    if (collectionMap.size > 0) {
      for (const [, colCard] of collectionMap) {
        if (!colCard.type_line) continue;
        const tl = colCard.type_line.toLowerCase();
        if (!tl.includes("legendary") || !tl.includes("creature")) continue;
        if (!colorMatches(colCard)) continue;
        commanderCard = {
          id: colCard.scryfall_id, name: colCard.card_name,
          set: colCard.set_code ?? "UNK", collector_number: colCard.collector_number ?? "0",
          type_line: colCard.type_line ?? "", mana_cost: colCard.mana_cost ?? "",
          cmc: colCard.cmc ?? 0, colors: colCard.colors ?? [], quantity: 1,
        } as ScryfallCard & { quantity: number };
        break;
      }
    }
    // Fall back to Scryfall if no collection commander found
    if (!commanderCard) {
      commanderCard = await pickCommander(params.colors, params.style, priceCap);
    }
    if (commanderCard) {
      selectedCards.push(commanderCard);
      usedNames.add(commanderCard.name);
      slotSummary["commander"] = 1;
    }
  }

  // ── 2. Apply style bias — ensure totals still add up ──
  const bias = STYLE_SLOT_BIAS[params.style] ?? {};
  const slots = BASE_SLOTS.map((slot) => ({
    ...slot,
    countCdr: Math.max(0, slot.countCdr + (bias[slot.name] ?? 0)),
    count60: Math.max(0, slot.count60 + Math.floor((bias[slot.name] ?? 0) / 2)),
  }));

  // ── 3. Fill each slot ──
  for (const slot of slots) {
    const target = config.isCommander ? slot.countCdr : slot.count60;
    if (target <= 0) continue;

    let filled = 0;

    // 3a. Collection first
    if (collectionMap.size > 0) {
      for (const [, colCard] of collectionMap) {
        if (filled >= target) break;
        if (usedNames.has(colCard.card_name)) continue;
        if (!colorMatches(colCard)) continue;
        if (!matchesSlot(colCard, slot.name)) continue;
        const qty = config.isCommander ? 1 : Math.min(config.maxCopies, target - filled, colCard.quantity);
        selectedCards.push({
          id: colCard.scryfall_id, name: colCard.card_name,
          set: colCard.set_code ?? "UNK", collector_number: colCard.collector_number ?? "0",
          type_line: colCard.type_line ?? "", mana_cost: colCard.mana_cost ?? "",
          cmc: colCard.cmc ?? 0, colors: colCard.colors ?? [], quantity: qty,
        } as ScryfallCard & { quantity: number });
        usedNames.add(colCard.card_name);
        filled += qty;
      }
    }

    // 3b. Scryfall — fetch 2 pages to get enough candidates
    if (filled < target) {
      const colorFilter = colorId ? `ci<=${colorId}` : "";
      const formatFilter = config.scryfallKey ? `f:${config.scryfallKey}` : "";
      const budgetFilter = priceCap < 100 ? `usd<=${priceCap}` : "";
      const typeFilter = slot.typeQuery ?? "";
      const q = [slot.oracleQuery, colorFilter, formatFilter, budgetFilter, typeFilter, "order:edhrec"]
        .filter(Boolean).join(" ");

      const results = await scryfallSearch(q, 2);
      for (const card of results) {
        if (filled >= target) break;
        if (usedNames.has(card.name)) continue;
        if (priceOf(card) > priceCap) continue;
        const qty = config.isCommander ? 1 : Math.min(config.maxCopies, target - filled);
        selectedCards.push({ ...card, quantity: qty });
        usedNames.add(card.name);
        filled += qty;
      }
    }

    // 3c. Broad fallback — no oracle filter, just color + format
    if (filled < target) {
      const colorFilter = colorId ? `ci<=${colorId}` : "";
      const formatFilter = config.scryfallKey ? `f:${config.scryfallKey}` : "";
      const fallbackQ = [`t:creature`, colorFilter, formatFilter, "order:edhrec"].filter(Boolean).join(" ");
      const fallback = await scryfallSearch(fallbackQ, 2);
      for (const card of fallback) {
        if (filled >= target) break;
        if (usedNames.has(card.name)) continue;
        if (priceOf(card) > priceCap) continue;
        const qty = config.isCommander ? 1 : Math.min(config.maxCopies, target - filled);
        selectedCards.push({ ...card, quantity: qty });
        usedNames.add(card.name);
        filled += qty;
      }
    }

    slotSummary[slot.name] = filled;
  }

  // ── 4. Final gap fill — should rarely trigger now ──
  const nonLandTotal = selectedCards.reduce((s, c) => s + c.quantity, 0);
  const targetNonLand = config.deckSize - config.landCount;

  if (nonLandTotal < targetNonLand) {
    const gap = targetNonLand - nonLandTotal;
    const colorFilter = colorId ? `ci<=${colorId}` : "";
    const formatFilter = config.scryfallKey ? `f:${config.scryfallKey}` : "";
    const padQ = [`t:creature pow>=2`, colorFilter, formatFilter, "order:edhrec"].filter(Boolean).join(" ");
    const padResults = await scryfallSearch(padQ, 3);
    let padded = 0;
    for (const card of padResults) {
      if (padded >= gap) break;
      if (usedNames.has(card.name)) continue;
      if (priceOf(card) > priceCap) continue;
      const qty = config.isCommander ? 1 : Math.min(config.maxCopies, gap - padded);
      selectedCards.push({ ...card, quantity: qty });
      usedNames.add(card.name);
      padded += qty;
    }
    slotSummary["threats"] = (slotSummary["threats"] ?? 0) + padded;
  }

  // ── 5. Lands — fill exactly to deckSize ──
  const nonLandCount = selectedCards.reduce((s, c) => s + c.quantity, 0);
  const landTarget = config.deckSize - nonLandCount;
  const lands = buildLands(params.colors, Math.max(landTarget, 0));
  selectedCards.push(...lands);
  slotSummary["lands"] = lands.reduce((s, c) => s + c.quantity, 0);

  // ── 6. Trim to exact deck size (safety net) ──
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

  // ── 7. Render ──
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

  return { cards: selectedCards, deckList: lines.join("\n"), slotSummary };
}

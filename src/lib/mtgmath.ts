/**
 * mtgmath.ts — Pure math/heuristic MTG analysis engine.
 * No AI calls. Uses Scryfall API + CommanderSpellbook API.
 *
 * Replaces AI for:
 *  - Card role classification  (keyword regex on oracle text)
 *  - Related card lookup       (Scryfall color+type search)
 *  - Combo detection           (CommanderSpellbook API)
 *  - Deck slot-filling         (Scryfall queries per role slot)
 *  - Mana curve optimization   (greedy CMC distribution)
 *  - Format legality           (Scryfall legalities field)
 */

import { searchCards, type ScryfallCard } from "./scryfall";

// ─────────────────────────────────────────────────────────────────────────────
// ROLE CLASSIFICATION
// ─────────────────────────────────────────────────────────────────────────────

export type CardRole =
  | "ramp"
  | "removal"
  | "draw"
  | "counter"
  | "finisher"
  | "threat"
  | "support"
  | "combo"
  | "lands"
  | "utility";

interface RoleRule {
  role: CardRole;
  patterns: RegExp[];
  typePatterns?: RegExp[];
  weight: number;
}

const ROLE_RULES: RoleRule[] = [
  {
    role: "lands",
    patterns: [],
    typePatterns: [/\bland\b/i],
    weight: 10,
  },
  {
    role: "ramp",
    patterns: [
      /add \{[WUBRGC]\}/i,
      /search your library for a (basic )?land/i,
      /put.{0,30}land.{0,20}onto the battlefield/i,
      /untap.{0,20}land/i,
      /you may play.{0,20}additional land/i,
    ],
    weight: 9,
  },
  {
    role: "removal",
    patterns: [
      /destroy target/i,
      /exile target/i,
      /deals? \d+ damage to (target|any)/i,
      /return target.{0,30}to (its owner'?s?|their owner'?s?) hand/i,
      /counter target spell/i,
      /\-\d+\/\-\d+/,
      /destroy all/i,
      /exile all/i,
    ],
    weight: 8,
  },
  {
    role: "counter",
    patterns: [
      /counter target (spell|creature|instant|sorcery|artifact|enchantment|planeswalker)/i,
      /counter it/i,
    ],
    weight: 8,
  },
  {
    role: "draw",
    patterns: [
      /draw (a|one|two|three|\d+) card/i,
      /look at the top \d+ cards/i,
      /scry \d+/i,
      /surveil \d+/i,
      /investigate/i,
    ],
    weight: 7,
  },
  {
    role: "combo",
    patterns: [
      /untap all/i,
      /take an extra turn/i,
      /copy (target|that|this)/i,
      /storm/i,
      /cascade/i,
      /whenever you (cast|play)/i,
      /infinite/i,
    ],
    weight: 6,
  },
  {
    role: "finisher",
    patterns: [
      /\btrample\b/i,
      /\bmenace\b/i,
      /\binfect\b/i,
      /\bpoison counter/i,
      /\blifelink\b.*\btrample\b/i,
    ],
    typePatterns: [/creature/i],
    weight: 5,
  },
  {
    role: "threat",
    patterns: [
      /\bflying\b/i,
      /\bhaste\b/i,
      /\bdouble strike\b/i,
      /\bfirst strike\b/i,
    ],
    typePatterns: [/creature/i],
    weight: 4,
  },
  {
    role: "support",
    patterns: [
      /other.{0,20}creatures? (you control|get)/i,
      /each (creature|player)/i,
      /whenever.{0,30}enters the battlefield/i,
      /\benlist\b/i,
      /\bconvoke\b/i,
    ],
    weight: 3,
  },
];

export function classifyRole(card: ScryfallCard): CardRole {
  const oracle = (card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? "").toLowerCase();
  const typeLine = (card.type_line ?? "").toLowerCase();

  let bestRole: CardRole = "utility";
  let bestWeight = -1;

  for (const rule of ROLE_RULES) {
    // Type-line gate
    if (rule.typePatterns && rule.typePatterns.length > 0) {
      const typeMatch = rule.typePatterns.some((p) => p.test(typeLine));
      if (!typeMatch) continue;
    }

    // Pure type match (e.g. lands)
    if (rule.patterns.length === 0 && rule.typePatterns) {
      const typeMatch = rule.typePatterns.some((p) => p.test(typeLine));
      if (typeMatch && rule.weight > bestWeight) {
        bestRole = rule.role;
        bestWeight = rule.weight;
      }
      continue;
    }

    const match = rule.patterns.some((p) => p.test(oracle));
    if (match && rule.weight > bestWeight) {
      bestRole = rule.role;
      bestWeight = rule.weight;
    }
  }

  return bestRole;
}

/** Human-readable one-liner about what the card does, derived from its oracle text and role. */
export function generateSimpleExplanation(card: ScryfallCard, role: CardRole): string {
  const name = card.name;
  const typeLine = card.type_line ?? "";
  const oracle = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? "";
  const pt = card.power ? `${card.power}/${card.toughness}` : null;
  const cmc = card.cmc ?? 0;

  const roleDesc: Record<CardRole, string> = {
    ramp:    "a mana accelerator that helps you cast bigger spells faster",
    removal: "a removal spell that deals with your opponent's threats",
    draw:    "a card advantage engine that keeps your hand full",
    counter: "a counterspell that stops your opponent's key plays",
    finisher:"a powerful finisher that closes out games",
    threat:  pt ? `a ${pt} creature that applies early pressure` : "a threatening creature",
    support: "a support piece that buffs or enables your team",
    combo:   "a combo enabler with explosive potential",
    lands:   "a land that provides mana for your spells",
    utility: "a versatile utility card",
  };

  const costNote = cmc <= 2 ? "efficiently costed" : cmc >= 6 ? "high-impact but expensive" : "mid-range";
  return `${name} is ${roleDesc[role]} (${costNote}, ${typeLine}).`;
}

/** Gameplay tip derived from role + oracle text. */
export function generateHowToUse(card: ScryfallCard, role: CardRole): string {
  const tips: Record<CardRole, string> = {
    ramp:    "Play this as early as possible to accelerate your mana development. It lets you cast threats ahead of the curve.",
    removal: "Hold this until your opponent commits a key threat, then answer it. Timing removal correctly is the difference between winning and losing.",
    draw:    "Use this when your hand is running low to refuel. Card advantage wins long games — don't waste this in the opening turns.",
    counter: "Keep mana open at all times to represent this. The threat of a counterspell is sometimes more powerful than countering.",
    finisher:"Drop this when you have enough mana to protect it or force it through. Back it up with disruption.",
    threat:  "Play this on curve and apply pressure immediately. Force your opponent to react to you.",
    support: "Play this when you have the most creatures on board to maximize its effect. It scales with the size of your team.",
    combo:   "This is a key piece of a combo. Protect it carefully and only assemble the combo when you can win immediately.",
    lands:   "Play this on your land drop. Consider the color production relative to your deck's needs.",
    utility: "Evaluate the situation before casting. This card has multiple applications — choose the most impactful line.",
  };
  return tips[role];
}

// ─────────────────────────────────────────────────────────────────────────────
// RELATED CARDS (via Scryfall)
// ─────────────────────────────────────────────────────────────────────────────

/** Find cards that share color identity + type, ranked by edhrec_rank. */
export async function findRelatedCards(card: ScryfallCard, limit = 5): Promise<string[]> {
  try {
    const colors = card.colors ?? card.card_faces?.[0]?.image_uris ? [] : [];
    const typeLine = card.type_line ?? "";

    // Extract primary type (Creature, Instant, Sorcery, Enchantment, Artifact, Planeswalker, Land)
    const typeMatch = typeLine.match(/\b(Creature|Instant|Sorcery|Enchantment|Artifact|Planeswalker|Land)\b/i);
    const primaryType = typeMatch?.[1] ?? null;

    // Build Scryfall query: same colors + same type, exclude the card itself, sort by edhrec rank
    let q = `-name:"${card.name}"`;
    if (primaryType) q += ` t:${primaryType.toLowerCase()}`;
    if (colors.length > 0) {
      const colorStr = colors.join("");
      q += ` color<=${colorStr}`;
    }
    q += ` order:edhrec`;

    const { data } = await searchCards(q, 1);
    return data.slice(0, limit).map((c) => c.name);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBO LOOKUP (CommanderSpellbook API)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComboResult {
  cards: string[];
  result: string;
}

export async function findCombos(cardName: string, limit = 3): Promise<ComboResult[]> {
  try {
    const res = await fetch(
      `https://backend.commanderspellbook.com/find-my-combos?cards=${encodeURIComponent(cardName)}&limit=${limit * 4}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    const results: ComboResult[] = [];
    const combos = data?.results ?? data?.included ?? data ?? [];
    const list = Array.isArray(combos) ? combos : [];

    for (const combo of list.slice(0, limit * 4)) {
      try {
        const cards: string[] = (combo.uses ?? combo.cards ?? []).map(
          (u: { card?: { name?: string }; name?: string } | string) =>
            typeof u === "string" ? u : u?.card?.name ?? u?.name ?? ""
        ).filter(Boolean);

        const result: string =
          combo.produces?.map((p: { feature?: { name?: string }; name?: string }) =>
            p?.feature?.name ?? p?.name ?? ""
          ).filter(Boolean).join(", ") ??
          combo.result ??
          combo.description ??
          "";

        if (cards.length >= 2 && result) {
          results.push({ cards, result });
        }
        if (results.length >= limit) break;
      } catch {
        continue;
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** Format combos as readable strings for display. */
export function formatCombos(combos: ComboResult[]): string[] {
  return combos.map((c) => {
    const others = c.cards.filter((n) => n).join(" + ");
    return `${others} → ${c.result}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DECK BUILDER (Scryfall slot-filling + mana curve optimizer)
// ─────────────────────────────────────────────────────────────────────────────

export interface DeckSlot {
  role: CardRole;
  count: number;
  cmcMin?: number;
  cmcMax?: number;
  extraQuery?: string;
}

/** Mana curve targets per playstyle */
const CURVE_TARGETS: Record<string, { low: number; mid: number; high: number }> = {
  Aggro:    { low: 0.55, mid: 0.35, high: 0.10 },
  Control:  { low: 0.20, mid: 0.45, high: 0.35 },
  Midrange: { low: 0.30, mid: 0.45, high: 0.25 },
  Combo:    { low: 0.30, mid: 0.40, high: 0.30 },
  Tempo:    { low: 0.45, mid: 0.45, high: 0.10 },
  Ramp:     { low: 0.20, mid: 0.35, high: 0.45 },
};

/** Budget price ceilings per card (USD) */
const BUDGET_CEILING: Record<string, number> = {
  budget: 1.5,
  mid: 8,
  competitive: 999,
  any: 999,
};

/** How many non-land slots to fill per role for 60-card decks */
const SLOTS_60: Record<string, Record<CardRole, number>> = {
  Aggro:    { threat: 16, removal: 8, draw: 4, support: 4, ramp: 2, counter: 0, finisher: 4, combo: 0, lands: 0, utility: 2 },
  Control:  { counter: 8, removal: 8, draw: 8, support: 4, ramp: 2, threat: 4, finisher: 4, combo: 0, lands: 0, utility: 2 },
  Midrange: { threat: 12, removal: 8, draw: 6, support: 4, ramp: 4, counter: 0, finisher: 4, combo: 0, lands: 0, utility: 2 },
  Combo:    { combo: 12, draw: 8, support: 8, ramp: 4, counter: 4, removal: 2, threat: 0, finisher: 2, lands: 0, utility: 0 },
  Tempo:    { threat: 12, counter: 8, removal: 6, draw: 6, support: 4, ramp: 0, finisher: 2, combo: 0, lands: 0, utility: 2 },
  Ramp:     { ramp: 12, finisher: 8, draw: 6, removal: 4, support: 4, threat: 2, counter: 2, combo: 0, lands: 0, utility: 2 },
};

/** Land count targets per format */
const LAND_COUNT: Record<string, number> = {
  Standard: 24,
  Pioneer:  24,
  Modern:   22,
  Pauper:   22,
  Casual:   24,
  Commander: 38,
};

/** Total non-land card count per format */
const DECK_SIZE: Record<string, number> = {
  Standard: 60,
  Pioneer:  60,
  Modern:   60,
  Pauper:   60,
  Casual:   60,
  Commander: 100,
};

export interface BuiltDeck {
  deckList: string;        // Arena/MTGO export format
  cardCount: number;
  roleBreakdown: Partial<Record<CardRole, number>>;
}

type FetchedCard = { card: ScryfallCard; quantity: number; role: CardRole };

/** Build a role query for Scryfall */
function buildRoleQuery(
  role: CardRole,
  colors: string[],
  format: string,
  budget: string,
  cmcMin?: number,
  cmcMax?: number,
  extra?: string
): string {
  const ROLE_SCRYFALL: Partial<Record<CardRole, string>> = {
    ramp:    `(o:"add {" or o:"search your library for a land" or t:land-ramp)`,
    removal: `(o:"destroy target" or o:"exile target" or o:"deals damage to target")`,
    draw:    `(o:"draw a card" or o:"draw two" or o:"draw three" or o:scry or o:surveil)`,
    counter: `(o:"counter target spell" or o:"counter target creature" or t:counterspell)`,
    finisher:`(t:creature (o:trample or o:menace or o:infect or pow>=5))`,
    threat:  `(t:creature (o:flying or o:haste or o:"double strike") cmc<=3)`,
    support: `(o:"other creatures" or o:"each creature")`,
    combo:   `(o:"untap all" or o:"take an extra turn" or o:storm or o:cascade)`,
    utility: `(not t:land)`,
  };

  let q = ROLE_SCRYFALL[role] ?? `not t:land`;

  // Color filter
  if (colors.length > 0) q += ` color<=${colors.join("")}`;

  // CMC filter
  if (cmcMin !== undefined) q += ` cmc>=${cmcMin}`;
  if (cmcMax !== undefined) q += ` cmc<=${cmcMax}`;

  // Format legality
  if (format !== "Casual") q += ` legal:${format.toLowerCase()}`;

  // Budget
  const ceiling = BUDGET_CEILING[budget] ?? 999;
  if (ceiling < 999) q += ` usd<=${ceiling}`;

  // Extra constraints
  if (extra) q += ` ${extra}`;

  q += ` order:edhrec`;

  return q;
}

/** Fetch a pool of cards for a role, deduplicated against already-chosen names. */
async function fetchSlot(
  role: CardRole,
  count: number,
  colors: string[],
  format: string,
  budget: string,
  usedNames: Set<string>,
  cmcMin?: number,
  cmcMax?: number,
  extra?: string
): Promise<ScryfallCard[]> {
  try {
    const q = buildRoleQuery(role, colors, format, budget, cmcMin, cmcMax, extra);
    const { data } = await searchCards(q, 1);
    const unique = data.filter((c) => !usedNames.has(c.name));
    // For Commander: max 1 copy per card
    return unique.slice(0, count);
  } catch {
    return [];
  }
}

/** Fetch basic lands based on color identity */
async function fetchBasicLands(colors: string[], count: number): Promise<{ name: string; quantity: number }[]> {
  const BASIC: Record<string, string> = {
    W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest",
  };
  if (colors.length === 0) {
    return [{ name: "Wastes", quantity: count }];
  }
  const perColor = Math.floor(count / colors.length);
  const remainder = count % colors.length;
  return colors.map((c, i) => ({
    name: BASIC[c] ?? "Forest",
    quantity: perColor + (i === 0 ? remainder : 0),
  }));
}

/** Format a card line in Arena/MTGO format */
function fmtLine(quantity: number, card: ScryfallCard): string {
  const set = (card.set ?? "").toUpperCase();
  const num = card.collector_number ?? "";
  return set && num
    ? `${quantity} ${card.name} (${set}) ${num}`
    : `${quantity} ${card.name}`;
}

/**
 * Main deck builder.
 * Returns a real, legal deck list built entirely from Scryfall data.
 */
export async function buildDeck(
  format: string,
  style: string,
  colors: string[],
  budget: string,
  commanderName?: string
): Promise<BuiltDeck> {
  const isCommander = format === "Commander";
  const deckSize = DECK_SIZE[format] ?? 60;
  const landCount = LAND_COUNT[format] ?? 24;
  const nonLandTarget = deckSize - landCount;

  const slotMap = SLOTS_60[style] ?? SLOTS_60.Midrange;
  const curve = CURVE_TARGETS[style] ?? CURVE_TARGETS.Midrange;

  const usedNames = new Set<string>();
  const fetchedCards: FetchedCard[] = [];
  const roleBreakdown: Partial<Record<CardRole, number>> = {};

  // Commander gets 99 non-land slots
  const scaleFactor = isCommander ? nonLandTarget / 40 : 1;

  // For each role, split into CMC buckets per curve target
  const roles = Object.entries(slotMap).filter(([r]) => r !== "lands") as [CardRole, number][];

  for (const [role, baseCount] of roles) {
    if (baseCount === 0) continue;
    const totalCount = Math.round(baseCount * scaleFactor);
    if (totalCount === 0) continue;

    const lowCount  = Math.round(totalCount * curve.low);
    const midCount  = Math.round(totalCount * curve.mid);
    const highCount = totalCount - lowCount - midCount;

    const buckets: [number | undefined, number | undefined, number][] = [
      [undefined, 2, lowCount],
      [3, 4, midCount],
      [5, undefined, highCount],
    ];

    let fetched: ScryfallCard[] = [];
    for (const [min, max, cnt] of buckets) {
      if (cnt <= 0) continue;
      const cards = await fetchSlot(role, cnt, colors, format, budget, usedNames, min, max);
      fetched = [...fetched, ...cards];
    }

    // If under quota, try again without CMC restriction
    if (fetched.length < totalCount) {
      const gap = totalCount - fetched.length;
      const extra = await fetchSlot(role, gap, colors, format, budget, usedNames);
      fetched = [...fetched, ...extra];
    }

    for (const card of fetched.slice(0, totalCount)) {
      usedNames.add(card.name);
      // Commander: 1 copy each. Others: up to 4 (3 for variety)
      const qty = isCommander ? 1 : Math.min(3, totalCount > 10 ? 2 : 4);
      fetchedCards.push({ card, quantity: qty, role });
      roleBreakdown[role] = (roleBreakdown[role] ?? 0) + qty;
    }
  }

  // Adjust total non-land to match exactly
  let currentNonLand = fetchedCards.reduce((s, c) => s + c.quantity, 0);
  // Trim or pad
  while (currentNonLand > nonLandTarget && fetchedCards.length > 0) {
    const last = fetchedCards[fetchedCards.length - 1];
    if (last.quantity > 1) { last.quantity--; } else { fetchedCards.pop(); }
    currentNonLand--;
  }

  // Build land section
  const lands = await fetchBasicLands(colors, landCount);

  // Assemble deck list string
  const lines: string[] = [];

  if (isCommander && commanderName) {
    lines.push("Commander");
    lines.push(`1 ${commanderName}`);
    lines.push("");
  }

  lines.push("Deck");
  for (const { card, quantity } of fetchedCards) {
    lines.push(fmtLine(quantity, card));
  }
  for (const { name, quantity } of lands) {
    lines.push(`${quantity} ${name}`);
  }

  return {
    deckList: lines.join("\n"),
    cardCount: currentNonLand + landCount,
    roleBreakdown,
  };
}

/**
 * gemini.ts — AI narrative layer (Gemini API, direct from browser).
 *
 * AI is used ONLY for content that requires language understanding:
 *   - Plain-English card explanation (1-2 sentences)
 *   - Gameplay tips (howToUse)
 *   - Deck name + description + strategy narrative
 *
 * Math handles everything else (see cardAnalytics.ts, deckBuilder.ts):
 *   - Card role classification  → classifyRole()
 *   - Related cards             → findRelatedCards()
 *   - Combo lookup              → findCombos()
 *   - Card selection + curve    → buildDeckMath()
 *
 * This hybrid approach eliminates:
 *   - Hallucinated card names and set codes in deck lists
 *   - Incorrect format legality claims
 *   - ~70% of AI API calls vs the previous pure-AI approach
 */

import { classifyRole, findRelatedCards, findCombos } from "./cardAnalytics";
import { buildDeckMath, type DeckBuilderParams, type BuiltDeck } from "./deckBuilder";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-pro",
];

function geminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

async function callGemini(systemPrompt: string, userPrompt: string, maxTokens = 512): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY in environment.");

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });

  let lastError = "";
  for (const model of GEMINI_MODELS) {
    const res = await fetch(geminiUrl(model), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.status === 404) { lastError = `model ${model} not found`; continue; }
    if (res.status === 429) throw new Error("Rate limited. Please wait a moment and try again.");
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Gemini error (${res.status}): ${t}`);
    }
    const data = await res.json();
    let text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return text;
  }
  throw new Error(`No available Gemini model. Last error: ${lastError}`);
}

// ── Card Explanation (Hybrid) ─────────────────────────────────────────────────

export interface CardPayload {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  cmc?: number;
  keywords?: string[];
}

export interface AIExplanation {
  simple?: string;
  howToUse?: string;
  combos?: string[];
  role?: string;
  related?: string[];
}

const aiCache = new Map<string, AIExplanation>();

/**
 * Explain a card using a hybrid approach:
 *  - role     → pure keyword classifier (instant, no API call)
 *  - related  → Scryfall search (no AI quota used)
 *  - combos   → CommanderSpellbook API (no AI quota used)
 *  - simple + howToUse → Gemini (minimal prompt, ~150 tokens out)
 */
export async function explainCard(card: CardPayload): Promise<AIExplanation> {
  if (aiCache.has(card.name)) return aiCache.get(card.name)!;

  // ── Math layer (parallel, no AI quota) ──
  const [related, combos] = await Promise.all([
    findRelatedCards({ name: card.name, colors: card.colors, type_line: card.type_line, oracle_text: card.oracle_text }),
    findCombos(card.name),
  ]);

  const role = classifyRole({
    oracle_text: card.oracle_text,
    type_line: card.type_line,
    power: card.power,
    toughness: card.toughness,
    cmc: card.cmc,
    keywords: card.keywords,
  });

  // ── AI layer — only plain-English explanation + tips ──
  let simple = "";
  let howToUse = "";

  try {
    const prompt = `You are an MTG coach. For this card, write ONLY:
1. "simple": 1-2 sentence plain-English explanation of what the card does.
2. "howToUse": 2-3 sentences of practical gameplay tips.

Card: ${card.name}
Type: ${card.type_line ?? "?"}
Mana cost: ${card.mana_cost ?? "?"}
Oracle text: ${card.oracle_text ?? "(none)"}
${card.power ? `P/T: ${card.power}/${card.toughness}` : ""}

Return ONLY valid JSON: {"simple":"...","howToUse":"..."}`;

    const raw = await callGemini(
      "You are a concise MTG expert. Reply with raw JSON only, no markdown.",
      prompt,
      256
    );
    const parsed = JSON.parse(raw);
    simple = parsed.simple ?? "";
    howToUse = parsed.howToUse ?? "";
  } catch {
    // Fallback: compose simple description from oracle text
    simple = card.oracle_text
      ? `${card.name} is a ${card.type_line ?? "card"} that ${card.oracle_text.split(".")[0].toLowerCase()}.`
      : `${card.name} is a ${card.type_line ?? "Magic card"}.`;
    howToUse = "";
  }

  const result: AIExplanation = { simple, howToUse, combos, role, related };
  aiCache.set(card.name, result);
  return result;
}

// ── Deck Generation (Hybrid) ──────────────────────────────────────────────────

export type { DeckBuilderParams as DeckParams };

export interface GeneratedDeck {
  name: string;
  description: string;
  strategy: string;
  deckList: string;
  /** Exposed for UI slot breakdown display */
  slotSummary?: Record<string, number>;
}

/**
 * Generate a deck using a hybrid approach:
 *  - Card selection  → buildDeckMath() (Scryfall, guaranteed real cards + legality)
 *  - Mana curve      → deckBuilder math
 *  - Budget filter   → Scryfall price data
 *  - Name + strategy → Gemini (minimal prompt, ~200 tokens out)
 *
 * Hallucinated card names and set codes are impossible because
 * all cards come directly from Scryfall's database.
 */
export async function generateDeck(params: DeckBuilderParams): Promise<GeneratedDeck> {
  // ── Step 1: Math builds the actual deck ──
  let builtDeck: BuiltDeck;
  try {
    builtDeck = await buildDeckMath(params);
  } catch (e) {
    throw new Error(`Deck builder failed: ${(e as Error).message}`);
  }

  // ── Step 2: AI writes the narrative wrapper only ──
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map((c) => colorNames[c] ?? c).join("/")
    : "colorless";

  // Give AI the slot summary so it can write an accurate strategy
  const slotDesc = Object.entries(builtDeck.slotSummary)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  let name = `${colorStr} ${params.style}`;
  let description = `A ${params.format} ${params.style.toLowerCase()} deck.`;
  let strategy = `Play to the ${params.style.toLowerCase()} game plan.`;

  try {
    const narrativePrompt = `You are an MTG deck naming expert. A ${params.format} ${params.style} deck was built with: ${slotDesc}.
Colors: ${colorStr}. Budget: ${params.budget}.
${params.notes ? `Notes: ${params.notes}` : ""}

Write ONLY valid JSON:
{
  "name": "creative 2-4 word deck name",
  "description": "1-2 sentence overview of the deck's identity",
  "strategy": "2-3 sentences explaining the win condition and key interactions"
}`;

    const raw = await callGemini(
      "You are a concise MTG deck naming expert. Reply with raw JSON only, no markdown.",
      narrativePrompt,
      300
    );
    const parsed = JSON.parse(raw);
    name = parsed.name ?? name;
    description = parsed.description ?? description;
    strategy = parsed.strategy ?? strategy;
  } catch {
    // Keep defaults — deck list is still valid
  }

  return {
    name,
    description,
    strategy,
    deckList: builtDeck.deckList,
    slotSummary: builtDeck.slotSummary,
  };
}

// ── Deck Narrative (used by Decksmith.tsx) ────────────────────────────────────

export interface DeckNarrative {
  name: string;
  description: string;
  strategy: string;
}

export interface DeckNarrativeParams {
  format: string;
  style: string;
  colors: string[];
  budget: string;
  notes?: string;
  roleBreakdown: Partial<Record<string, number>>;
}

/**
 * Generate only the narrative wrapper for a pre-built deck.
 * Card selection is already done by buildDeck() — this only writes
 * the creative name, description, and strategy text.
 * ~300 output tokens max.
 */
export async function generateDeckNarrative(params: DeckNarrativeParams): Promise<DeckNarrative> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map((c) => colorNames[c] ?? c).join("/")
    : "colorless";

  const slotDesc = Object.entries(params.roleBreakdown)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  const defaults: DeckNarrative = {
    name: `${colorStr} ${params.style}`,
    description: `A ${params.format} ${params.style.toLowerCase()} deck.`,
    strategy: `Play to the ${params.style.toLowerCase()} game plan using your available cards.`,
  };

  try {
    const prompt = `A ${params.format} ${params.style} deck was math-built with: ${slotDesc}.
Colors: ${colorStr}. Budget tier: ${params.budget}.
${params.notes ? `Player notes: ${params.notes}` : ""}

Write ONLY valid JSON (no markdown):
{
  "name": "creative 2-4 word deck name",
  "description": "1-2 sentence overview of the deck's identity",
  "strategy": "2-3 sentences: win condition, key synergies, game plan"
}`;

    const raw = await callGemini(
      "You are a concise MTG deck naming expert. Reply with raw JSON only, no markdown, no code fences.",
      prompt,
      300
    );
    const parsed = JSON.parse(raw);
    return {
      name: parsed.name ?? defaults.name,
      description: parsed.description ?? defaults.description,
      strategy: parsed.strategy ?? defaults.strategy,
    };
  } catch {
    return defaults;
  }
}

/**
 * gemini.ts — AI narrative layer (Gemini 2.0 Flash, direct from browser).
 *
 * Architecture — hybrid math + AI:
 *   Card explain:    role/related/combos = pure math  |  simple/howToUse = 1 Gemini call
 *   Deck narrative:  card selection = deckBuilder.ts  |  name/description/strategy = 1 Gemini call
 *
 * Optimizations:
 *   1. Session-memory cache (Map)  — instant repeat lookups within a page session
 *   2. Persistent localStorage cache (TTL 24h) — survives page reload, no re-fetch
 *   3. In-flight deduplication — concurrent requests for same card share one fetch
 *   4. Math runs in parallel with AI prompt construction (saves ~100ms)
 *   5. Tight token budgets: card=200, deck=250 (was 512/300)
 *   6. Model waterfall: 2.0-flash → 2.0-flash-lite → 1.5-flash
 *   7. Graceful fallback: AI failure never blocks deck save or card view
 */

import { classifyRole, findRelatedCards, findCombos } from "./cardAnalytics";
import { buildDeckMath, type DeckBuilderParams, type BuiltDeck } from "./deckBuilder";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24h

// ─── Layer 1: Session-memory cache (instant, no I/O) ─────────────────────────
const sessionCache = new Map<string, unknown>();

// ─── Layer 2: Persistent localStorage cache (survives reload) ────────────────
function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`phantom_ai_${key}`);
    if (!raw) return null;
    const { value, expires } = JSON.parse(raw);
    if (Date.now() > expires) { localStorage.removeItem(`phantom_ai_${key}`); return null; }
    return value as T;
  } catch { return null; }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`phantom_ai_${key}`,
      JSON.stringify({ value, expires: Date.now() + CACHE_TTL_MS }));
  } catch { /* ignore storage quota */ }
}

function getCached<T>(key: string): T | null {
  if (sessionCache.has(key)) return sessionCache.get(key) as T;
  const persisted = lsGet<T>(key);
  if (persisted) { sessionCache.set(key, persisted); return persisted; }
  return null;
}

function setCached<T>(key: string, value: T): void {
  sessionCache.set(key, value);
  lsSet(key, value);
}

// ─── Layer 3: In-flight deduplication ────────────────────────────────────────
// Two concurrent explain calls for the same card → share one Gemini fetch
const inFlight = new Map<string, Promise<string>>();

// ─── Gemini API caller ────────────────────────────────────────────────────────
const MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];

function geminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 256,
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY in environment.");

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });

  let lastError = "";
  for (const model of MODELS) {
    const res = await fetch(geminiUrl(model), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.status === 404) { lastError = `${model} not available`; continue; }
    if (res.status === 429) throw new Error("Rate limited — please wait a moment and try again.");
    if (!res.ok) { lastError = `HTTP ${res.status}`; continue; }
    const data = await res.json();
    let text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    // Strip markdown code fences if model returns them
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return text;
  }
  throw new Error(`All Gemini models unavailable. Last: ${lastError}`);
}

// ─── Card Explanation ─────────────────────────────────────────────────────────

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

/**
 * Explain a card using hybrid math + 1 AI call.
 *
 * Flow:
 *   1. Check session cache (instant)
 *   2. Check localStorage cache (fast)
 *   3. Start math lookups + AI call in parallel
 *   4. Merge results, cache, return
 *
 * Concurrent calls for the same card share one in-flight Gemini fetch.
 */
export async function explainCard(card: CardPayload): Promise<AIExplanation> {
  const key = `card_${card.name}`;

  // Layers 1 & 2: cache hit
  const cached = getCached<AIExplanation>(key);
  if (cached) return cached;

  // Layer 3: parallel execution — math + AI prompt together
  const role = classifyRole({
    oracle_text: card.oracle_text,
    type_line:   card.type_line,
    power:       card.power,
    toughness:   card.toughness,
    cmc:         card.cmc,
    keywords:    card.keywords,
  });

  // Math lookups and AI call run in parallel
  const mathPromise = Promise.all([
    findRelatedCards({ name: card.name, colors: card.colors, type_line: card.type_line, oracle_text: card.oracle_text }),
    findCombos(card.name),
  ]);

  // Deduplicate: if another call for this card is in-flight, piggyback on it
  if (!inFlight.has(key)) {
    const prompt = `Card: ${card.name}
Type: ${card.type_line ?? "?"}  Mana: ${card.mana_cost ?? "?"}
Text: ${card.oracle_text ?? "(none)"}${card.power ? `  P/T: ${card.power}/${card.toughness}` : ""}

Reply with ONLY valid JSON (no markdown):
{"simple":"1-2 sentence plain-English explanation","howToUse":"2-3 sentence practical gameplay tip"}`;

    inFlight.set(key, callGemini(
      "You are a concise MTG coach. Reply with raw JSON only.",
      prompt,
      200,
    ));
  }

  // Await both in parallel
  const [aiRaw, [related, combos]] = await Promise.all([
    inFlight.get(key)!.finally(() => inFlight.delete(key)),
    mathPromise,
  ]);

  let simple = "";
  let howToUse = "";
  try {
    const parsed = JSON.parse(aiRaw);
    simple   = parsed.simple   ?? "";
    howToUse = parsed.howToUse ?? "";
  } catch {
    // Fallback: construct from oracle text — no AI needed
    simple = card.oracle_text
      ? `${card.name} is a ${card.type_line ?? "card"} that ${card.oracle_text.split(".")[0].toLowerCase()}.`
      : `${card.name} is a ${card.type_line ?? "Magic card"}.`;
  }

  const result: AIExplanation = { simple, howToUse, combos, role, related };
  setCached(key, result);
  return result;
}

// ─── Deck Narrative ───────────────────────────────────────────────────────────

export type { DeckBuilderParams as DeckParams };

export interface GeneratedDeck {
  name: string;
  description: string;
  strategy: string;
  deckList: string;
  slotSummary?: Record<string, number>;
}

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
 * Generate only the narrative for a pre-built deck.
 * Card selection is already done by buildDeck() — this writes only
 * the creative name, description, and strategy (~250 tokens out).
 *
 * Fails gracefully: if Gemini is down, sensible defaults are returned
 * so the user can still save their deck.
 */
export async function generateDeckNarrative(params: DeckNarrativeParams): Promise<DeckNarrative> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map((c) => colorNames[c] ?? c).join("/")
    : "colorless";

  // Pre-fill defaults — returned immediately if AI fails
  const defaults: DeckNarrative = {
    name:        `${colorStr} ${params.style}`,
    description: `A ${params.format} ${params.style.toLowerCase()} deck.`,
    strategy:    `Play to the ${params.style.toLowerCase()} game plan using your available cards.`,
  };

  const slotDesc = Object.entries(params.roleBreakdown)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  const prompt = `${params.format} ${params.style} deck — ${slotDesc}. Colors: ${colorStr}. Budget: ${params.budget}.${params.notes ? ` Notes: ${params.notes}` : ""}

Reply with ONLY valid JSON (no markdown):
{"name":"creative 2-4 word deck name","description":"1-2 sentence identity","strategy":"2-3 sentences: win condition and key synergies"}`;

  try {
    const raw = await callGemini(
      "You are a concise MTG deck naming expert. Reply with raw JSON only.",
      prompt,
      250,
    );
    const parsed = JSON.parse(raw);
    return {
      name:        (parsed.name        as string | undefined) ?? defaults.name,
      description: (parsed.description as string | undefined) ?? defaults.description,
      strategy:    (parsed.strategy    as string | undefined) ?? defaults.strategy,
    };
  } catch {
    // AI failure — deck save still works with defaults
    return defaults;
  }
}

/**
 * Full deck generation: math builds cards, AI writes narrative.
 * Used by edge-function callers and any legacy generateDeck() calls.
 */
export async function generateDeck(params: DeckBuilderParams): Promise<GeneratedDeck> {
  const builtDeck: BuiltDeck = await buildDeckMath(params);

  const narrative = await generateDeckNarrative({
    format: params.format,
    style:  params.style,
    colors: params.colors,
    budget: params.budget,
    notes:  params.notes,
    roleBreakdown: builtDeck.slotSummary,
  });

  return {
    ...narrative,
    deckList:    builtDeck.deckList,
    slotSummary: builtDeck.slotSummary,
  };
}

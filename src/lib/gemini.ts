/**
 * gemini.ts — AI-first deck generation + hybrid card explanation.
 *
 * Deck generation:
 *   - AI picks every card (full creative control, archetype awareness)
 *   - Scryfall resolves each card name → real ID, set code, image URL
 *   - Result: AI creativity + zero hallucinated set codes
 *
 * Card explanation:
 *   - role / related / combos = pure math (cardAnalytics.ts)
 *   - simple / howToUse      = 1 Gemini call (~200 tokens)
 *
 * Caching: session Map + localStorage (24h TTL) to minimise API calls.
 */

import { classifyRole, findRelatedCards, findCombos } from "./cardAnalytics";
import type { ScryfallCard } from "./scryfall";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 h

// ── Cache helpers ─────────────────────────────────────────────────────────────
const sessionCache = new Map<string, unknown>();

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
  } catch { /* ignore quota */ }
}
function getCached<T>(key: string): T | null {
  if (sessionCache.has(key)) return sessionCache.get(key) as T;
  const p = lsGet<T>(key);
  if (p) { sessionCache.set(key, p); return p; }
  return null;
}
function setCached<T>(key: string, value: T): void {
  sessionCache.set(key, value);
  lsSet(key, value);
}

// ── In-flight deduplication ───────────────────────────────────────────────────
const inFlight = new Map<string, Promise<string>>();

// ── Gemini API ────────────────────────────────────────────────────────────────
const MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];

function geminiUrl(m: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`;
}

async function callGemini(system: string, user: string, maxTokens = 256): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY in environment.");
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${system}\n\n${user}` }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });
  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch(geminiUrl(model), {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    if (res.status === 404) { lastErr = `${model} unavailable`; continue; }
    if (res.status === 429) throw new Error("Rate limited — please wait a moment.");
    if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
    const data = await res.json();
    let text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    return text;
  }
  throw new Error(`All Gemini models unavailable. Last: ${lastErr}`);
}

/** Public passthrough for one-off prompts (e.g. deck analysis) */
export async function callGeminiRaw(prompt: string, maxTokens = 512): Promise<string> {
  return callGemini("You are a concise MTG expert. Reply with raw JSON only, no markdown.", prompt, maxTokens);
}

// ── Card Explanation (hybrid) ─────────────────────────────────────────────────

export interface CardPayload {
  name: string; type_line?: string; mana_cost?: string; oracle_text?: string;
  power?: string; toughness?: string; loyalty?: string;
  colors?: string[]; cmc?: number; keywords?: string[];
}
export interface AIExplanation {
  simple?: string; howToUse?: string; combos?: string[];
  role?: string; related?: string[];
}

export async function explainCard(card: CardPayload): Promise<AIExplanation> {
  const key = `card_${card.name}`;
  const cached = getCached<AIExplanation>(key);
  if (cached) return cached;

  const role = classifyRole({
    oracle_text: card.oracle_text, type_line: card.type_line,
    power: card.power, toughness: card.toughness, cmc: card.cmc, keywords: card.keywords,
  });

  const mathPromise = Promise.all([
    findRelatedCards({ name: card.name, colors: card.colors, type_line: card.type_line, oracle_text: card.oracle_text }),
    findCombos(card.name),
  ]);

  if (!inFlight.has(key)) {
    const prompt = `Card: ${card.name}
Type: ${card.type_line ?? "?"}  Mana: ${card.mana_cost ?? "?"}
Text: ${card.oracle_text ?? "(none)"}${card.power ? `  P/T: ${card.power}/${card.toughness}` : ""}

Reply ONLY valid JSON (no markdown):
{"simple":"1-2 sentence plain-English explanation","howToUse":"2-3 sentence practical gameplay tip"}`;
    inFlight.set(key, callGemini("You are a concise MTG coach. Reply raw JSON only.", prompt, 200));
  }

  const [aiRaw, [related, combos]] = await Promise.all([
    inFlight.get(key)!.finally(() => inFlight.delete(key)),
    mathPromise,
  ]);

  let simple = "", howToUse = "";
  try {
    const p = JSON.parse(aiRaw);
    simple = p.simple ?? "";
    howToUse = p.howToUse ?? "";
  } catch {
    simple = card.oracle_text
      ? `${card.name} is a ${card.type_line ?? "card"} that ${card.oracle_text.split(".")[0].toLowerCase()}.`
      : `${card.name} is a ${card.type_line ?? "Magic card"}.`;
  }

  const result: AIExplanation = { simple, howToUse, combos, role, related };
  setCached(key, result);
  return result;
}

// ── Deck Generation (AI-first, Scryfall-resolved) ────────────────────────────

export interface DeckParams {
  format: string;
  style: string;
  colors: string[];
  budget: string;
  notes?: string;
}

export interface DeckNarrative {
  name: string;
  description: string;
  strategy: string;
}

export interface DeckNarrativeParams {
  format: string; style: string; colors: string[]; budget: string;
  notes?: string; roleBreakdown: Partial<Record<string, number>>;
}

/** Resolved card ready for DB insert */
export interface ResolvedCard {
  scryfall_id: string;
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
  image_url: string | null;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  colors: string[];
  is_commander: boolean;
  is_sideboard: boolean;
}

export interface GeneratedDeck {
  name: string;
  description: string;
  strategy: string;
  deckList: string;           // Arena/MTGO format for display
  resolvedCards: ResolvedCard[];
  slotSummary?: Record<string, number>;
}

// ── Scryfall card resolver ────────────────────────────────────────────────────

const scryfallCache = new Map<string, ScryfallCard | null>();

async function resolveCardName(name: string): Promise<ScryfallCard | null> {
  const key = name.toLowerCase();
  if (scryfallCache.has(key)) return scryfallCache.get(key)!;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!res.ok) { scryfallCache.set(key, null); return null; }
    const card = await res.json() as ScryfallCard;
    scryfallCache.set(key, card);
    return card;
  } catch {
    scryfallCache.set(key, null);
    return null;
  }
}

function cardImageUrl(card: ScryfallCard): string | null {
  return card.image_uris?.normal ?? card.image_uris?.large ?? card.image_uris?.small
    ?? card.card_faces?.[0]?.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.large ?? null;
}

/**
 * Parse a simple AI deck list. Accepts:
 *   "4 Lightning Bolt"
 *   "4 Lightning Bolt (M11) 149"
 *   "Commander\n1 Atraxa"  / "Deck\n4 ..."
 */
interface ParsedLine { qty: number; name: string; isCommander: boolean; isSideboard: boolean }

function parseAIDeckList(raw: string): ParsedLine[] {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result: ParsedLine[] = [];
  let isCommander = false, isSideboard = false;
  for (const line of lines) {
    if (/^commander$/i.test(line))  { isCommander = true; isSideboard = false; continue; }
    if (/^deck$/i.test(line))       { isCommander = false; isSideboard = false; continue; }
    if (/^sideboard$/i.test(line))  { isCommander = false; isSideboard = true; continue; }
    if (line.startsWith("//"))      continue;
    // "4 Card Name (SET) 123" or "4 Card Name"
    const m = line.match(/^(\d+)\s+(.+?)(?:\s+\([A-Za-z0-9]+\)\s*\S*)?$/);
    if (!m) continue;
    result.push({ qty: parseInt(m[1], 10), name: m[2].trim(), isCommander, isSideboard });
    if (isCommander) isCommander = false; // only first line after "Commander" header
  }
  return result;
}

/**
 * Generate a complete deck using AI for card selection.
 *
 * Flow:
 *  1. Gemini generates name + description + strategy + full card list
 *  2. Parse card names + quantities from AI output
 *  3. Batch-resolve every card via Scryfall /cards/named?fuzzy=
 *  4. Return resolved cards with real IDs, set codes, images
 *
 * AI has full creative control. Scryfall guarantees accurate metadata.
 */
export async function generateDeck(params: DeckParams): Promise<GeneratedDeck> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map(c => colorNames[c] ?? c).join("/")
    : "any colors";

  const isCommander = params.format.toLowerCase() === "commander";
  const deckSize = isCommander ? 100 : 60;
  const landCount = isCommander ? 37 : 24;

  const prompt = `You are a Magic: The Gathering deck building expert. Build a complete ${params.format} deck.

Parameters:
- Format: ${params.format} (${deckSize} cards${isCommander ? ", singleton, needs a Commander" : ""})
- Playstyle: ${params.style}
- Colors: ${colorStr}
- Budget: ${params.budget === "budget" ? "under $30 total" : params.budget === "mid" ? "$30-$100" : params.budget === "competitive" ? "$100+" : "no limit"}
${params.notes ? `- Notes: ${params.notes}` : ""}

Rules:
- Use REAL, existing Magic cards with correct names
- Include exactly ${landCount} lands
- Include a mix of: ramp, card draw, removal, threats appropriate for ${params.style}
${isCommander ? "- First line after 'Commander' header must be the commander (1 legendary creature)" : "- Max 4 copies of any non-basic card"}
- Make it synergistic and competitive for the format

Return ONLY valid JSON (no markdown, no code fences):
{
  "name": "creative 2-4 word deck name",
  "description": "1-2 sentence overview",
  "strategy": "2-3 sentences: win condition and key synergies",
  "deckList": "Commander\\n1 <Commander Name>\\n\\nDeck\\n4 <Card Name>\\n..."
}`;

  const raw = await callGemini(
    "You are an expert MTG deck builder. Reply with raw JSON only, no markdown or code fences.",
    prompt,
    2048
  );

  let parsed: { name?: string; description?: string; strategy?: string; deckList?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract deckList from raw text if JSON parse fails
    parsed = {
      name: `${colorStr} ${params.style}`,
      description: `A ${params.format} ${params.style.toLowerCase()} deck.`,
      strategy: "Play to the game plan.",
      deckList: raw,
    };
  }

  const deckListRaw = parsed.deckList ?? raw;
  const parsedLines = parseAIDeckList(deckListRaw);

  // Resolve all cards via Scryfall in batches (respect rate limits)
  const BATCH = 8;
  const resolvedCards: ResolvedCard[] = [];
  const resolvedLines: string[] = [];

  // Track section headers for output
  let hasCommander = false;

  for (let i = 0; i < parsedLines.length; i += BATCH) {
    const batch = parsedLines.slice(i, i + BATCH);
    const scryfallResults = await Promise.all(batch.map(l => resolveCardName(l.name)));

    for (let j = 0; j < batch.length; j++) {
      const line = batch[j];
      const sf = scryfallResults[j];

      if (line.isCommander && !hasCommander) {
        resolvedLines.push("Commander");
        hasCommander = true;
      } else if (!line.isCommander && hasCommander && resolvedLines[resolvedLines.length - 1] !== "") {
        resolvedLines.push("");
        resolvedLines.push("Deck");
      }

      if (sf) {
        // Use real Scryfall data
        const displayLine = `${line.qty} ${sf.name} (${(sf.set ?? "UNK").toUpperCase()}) ${sf.collector_number ?? ""}`.trim();
        resolvedLines.push(displayLine);
        resolvedCards.push({
          scryfall_id: sf.id,
          name: sf.name,
          quantity: line.qty,
          set_code: sf.set ?? null,
          collector_number: sf.collector_number ?? null,
          image_url: cardImageUrl(sf),
          mana_cost: sf.mana_cost ?? null,
          cmc: sf.cmc ?? null,
          type_line: sf.type_line ?? null,
          colors: sf.colors ?? [],
          is_commander: line.isCommander,
          is_sideboard: line.isSideboard,
        });
      } else {
        // Card name not found — keep AI's name, mark as unresolved
        resolvedLines.push(`${line.qty} ${line.name}`);
        resolvedCards.push({
          scryfall_id: "unknown",
          name: line.name,
          quantity: line.qty,
          set_code: null,
          collector_number: null,
          image_url: null,
          mana_cost: null,
          cmc: null,
          type_line: null,
          colors: [],
          is_commander: line.isCommander,
          is_sideboard: line.isSideboard,
        });
      }
    }

    // Small delay between batches to respect Scryfall rate limit
    if (i + BATCH < parsedLines.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // If no Commander section in output, add Deck header
  if (!hasCommander && resolvedLines[0] !== "Deck") {
    resolvedLines.unshift("Deck");
  }

  return {
    name: parsed.name ?? `${colorStr} ${params.style}`,
    description: parsed.description ?? `A ${params.format} ${params.style.toLowerCase()} deck.`,
    strategy: parsed.strategy ?? "Play to the game plan.",
    deckList: resolvedLines.join("\n"),
    resolvedCards,
  };
}

// ── generateDeckNarrative (used by Decksmith when math builds the deck) ────────

export async function generateDeckNarrative(params: DeckNarrativeParams): Promise<DeckNarrative> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length ? params.colors.map(c => colorNames[c] ?? c).join("/") : "colorless";

  const defaults: DeckNarrative = {
    name:        `${colorStr} ${params.style}`,
    description: `A ${params.format} ${params.style.toLowerCase()} deck.`,
    strategy:    `Play to the ${params.style.toLowerCase()} game plan.`,
  };

  const slotDesc = Object.entries(params.roleBreakdown)
    .filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => `${v} ${k}`).join(", ");

  try {
    const prompt = `${params.format} ${params.style} deck — ${slotDesc}. Colors: ${colorStr}. Budget: ${params.budget}.${params.notes ? ` Notes: ${params.notes}` : ""}

Reply ONLY valid JSON:
{"name":"creative 2-4 word deck name","description":"1-2 sentence identity","strategy":"2-3 sentences: win condition and key synergies"}`;

    const raw = await callGemini(
      "You are a concise MTG deck naming expert. Reply raw JSON only.", prompt, 250,
    );
    const p = JSON.parse(raw);
    return {
      name:        (p.name as string | undefined)        ?? defaults.name,
      description: (p.description as string | undefined) ?? defaults.description,
      strategy:    (p.strategy as string | undefined)    ?? defaults.strategy,
    };
  } catch {
    return defaults;
  }
}

// ── Collection Insight (lightweight — used by Dashboard) ──────────────────────

/**
 * Generate a single 2-sentence insight about a user's collection.
 * Uses ~80 output tokens vs the ~2048 that generateDeck burns.
 * Result is cached in sessionStorage for the day by the caller.
 */
export async function generateCollectionInsight(cardNames: string[]): Promise<string> {
  const top = cardNames.slice(0, 15).join(", ");
  const prompt = `A Magic: The Gathering player owns these cards: ${top}.
Give ONE practical tip (2 sentences max) about synergies, combos, or upgrade ideas.
Reply in plain English only — no JSON, no markdown, no bullet points.`;

  try {
    const raw = await callGemini(
      "You are a concise MTG advisor. Reply with plain text only, 2 sentences max.",
      prompt,
      120
    );
    // Strip any accidental JSON or markdown the model might add
    return raw.replace(/^[{["']|[}"\]']$/g, "").replace(/\\n/g, " ").trim()
      || "Keep exploring the multiverse — your collection is growing!";
  } catch {
    return "Keep exploring the multiverse — your collection is growing!";
  }
}

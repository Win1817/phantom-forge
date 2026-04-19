/**
 * gemini.ts — AI narrative layer (minimal calls).
 *
 * AI is now responsible ONLY for:
 *   explainCard  → plain-English flavor text for a card (optional, on-demand)
 *   generateDeckNarrative → deck name + description + strategy (after math builds the list)
 *
 * Role classification, related cards, combo detection, and deck slot-filling
 * are all handled by src/lib/mtgmath.ts — no AI required for those.
 */

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

// ─── Card explanation (plain-English flavor only) ───────────────────────────

export interface CardPayload {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

/** Role, related cards, and combos come from mtgmath.ts — AI only adds flavor text. */
export interface AIExplanation {
  simple?: string;
  howToUse?: string;
  combos?: string[];
  role?: string;
  related?: string[];
}

export async function explainCard(card: CardPayload): Promise<AIExplanation> {
  const prompt = `You are an MTG coach. Write a SHORT plain-English explanation of this card for a beginner.
Card: ${card.name}
Type: ${card.type_line ?? "?"}
Mana cost: ${card.mana_cost ?? "?"}
Oracle text: ${card.oracle_text ?? "(none)"}
${card.power ? `P/T: ${card.power}/${card.toughness}` : ""}

Return ONLY valid JSON with these keys:
{
  "simple": "1-2 sentence beginner-friendly explanation in plain English",
  "howToUse": "1-2 sentences of practical gameplay advice"
}`;

  try {
    const raw = await callGemini(
      "You are a concise MTG expert. Reply with raw JSON only — no markdown, no code fences.",
      prompt,
      256
    );
    return JSON.parse(raw) as AIExplanation;
  } catch {
    return {};
  }
}

// ─── Deck narrative (name + description + strategy only) ───────────────────

export interface DeckNarrative {
  name: string;
  description: string;
  strategy: string;
}

export interface DeckParams {
  format: string;
  style: string;
  colors: string[];
  budget: string;
  notes?: string;
  roleBreakdown?: Partial<Record<string, number>>;
}

/** Math builds the real deck list. AI only writes the name, description, and strategy blurb. */
export async function generateDeckNarrative(params: DeckParams): Promise<DeckNarrative> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map((c) => colorNames[c] ?? c).join("/")
    : "colorless";

  const roleStr = params.roleBreakdown
    ? Object.entries(params.roleBreakdown)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 4)
        .map(([r, n]) => `${n} ${r}`)
        .join(", ")
    : "";

  const prompt = `A ${params.style} ${params.format} deck was built with these colors: ${colorStr}.
Dominant card roles in the deck: ${roleStr || "mixed"}.
${params.notes ? `Player notes: ${params.notes}` : ""}

Give this deck a creative, thematic name and a short description.

Return ONLY valid JSON:
{
  "name": "creative MTG deck name (2-5 words)",
  "description": "1 sentence flavor overview",
  "strategy": "2 sentences explaining the win condition and key gameplan"
}`;

  try {
    const raw = await callGemini(
      "You are a concise MTG expert. Reply with raw JSON only — no markdown, no code fences.",
      prompt,
      256
    );
    return JSON.parse(raw) as DeckNarrative;
  } catch {
    const fallbackNames: Record<string, string> = {
      Aggro: "Blazing Onslaught", Control: "Iron Will", Midrange: "The Grind",
      Combo: "Arcane Engine", Tempo: "Swift Current", Ramp: "Ancient Growth",
    };
    return {
      name: fallbackNames[params.style] ?? "Forged Deck",
      description: `A ${colorStr} ${params.style} deck for ${params.format}.`,
      strategy: "Build board presence and apply pressure according to your curve.",
    };
  }
}

// Keep legacy export so existing imports don't break during transition
export type { DeckNarrative as GeneratedDeck };

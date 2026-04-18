// Direct Gemini API client — bypasses Supabase Edge Functions
// (free tier blocks outbound fetch to external domains)

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;

// Try models in order until one responds — handles keys with restricted model access
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

async function callGemini(systemPrompt: string, userPrompt: string, maxTokens = 1024): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error("Missing VITE_GEMINI_API_KEY in environment.");

  // v1beta systemInstruction not supported on all key types — fold into user message
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

  throw new Error(`No available Gemini model found. Last error: ${lastError}`);
}

// ── explain-card ─────────────────────────────────────────────────────────────

export interface CardPayload {
  name: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
}

export interface AIExplanation {
  simple?: string;
  howToUse?: string;
  combos?: string[];
  role?: string;
  related?: string[];
}

export async function explainCard(card: CardPayload): Promise<AIExplanation> {
  const prompt = `You are an MTG coach. Explain this card for a beginner.
Card: ${card.name}
Type: ${card.type_line ?? "?"}
Mana cost: ${card.mana_cost ?? "?"}
Oracle text: ${card.oracle_text ?? "(none)"}
${card.power ? `P/T: ${card.power}/${card.toughness}` : ""}
${card.loyalty ? `Loyalty: ${card.loyalty}` : ""}

Return ONLY valid JSON with these keys:
{
  "simple": "1-2 sentence plain-English explanation",
  "howToUse": "2-3 sentences of practical gameplay tips",
  "combos": ["short combo or synergy idea", "another"],
  "role": "one of: ramp, removal, finisher, support, draw, counter, threat, utility, lands, combo",
  "related": ["card name", "card name", "card name"]
}`;

  const raw = await callGemini(
    "You are a concise MTG expert. Always reply with raw JSON only, no markdown.",
    prompt,
    512
  );

  try {
    return JSON.parse(raw) as AIExplanation;
  } catch {
    return { simple: raw, howToUse: "", combos: [], role: "utility", related: [] };
  }
}

// ── generate-deck ─────────────────────────────────────────────────────────────

export interface DeckParams {
  format: string;
  style: string;
  colors: string[];
  budget: string;
  notes?: string;
}

export interface GeneratedDeck {
  name: string;
  description: string;
  strategy: string;
  deckList: string;
}

export async function generateDeck(params: DeckParams): Promise<GeneratedDeck> {
  const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
  const colorStr = params.colors.length
    ? params.colors.map((c) => colorNames[c] ?? c).join(", ")
    : "any colors";

  const prompt = `You are a Magic: The Gathering deck building expert. Build a complete ${params.format} deck.

Parameters:
- Format: ${params.format}
- Playstyle: ${params.style}
- Colors: ${colorStr}
- Budget: ${params.budget}
${params.notes ? `- Additional notes: ${params.notes}` : ""}

Generate a complete, legal, and competitive deck for this format.
The deck list MUST use the exact Arena/MTGO export format:
- Main deck lines: "<quantity> <Card Name> (<SET>) <collector_number>"
- Use real, existing Magic cards with correct set codes and collector numbers
- Include the correct number of cards for the format (60 for most, 100 for Commander)
- Include lands

Return ONLY valid JSON with these exact keys (no markdown, no code fences):
{
  "name": "creative deck name",
  "description": "1-2 sentence overview",
  "strategy": "2-3 sentences explaining the win condition and key interactions",
  "deckList": "Deck\n4 Lightning Bolt (M11) 149\n..."
}`;

  const raw = await callGemini(
    "You are a concise MTG deck building expert. Always reply with raw JSON only, no markdown, no code fences.",
    prompt,
    2048
  );

  try {
    return JSON.parse(raw) as GeneratedDeck;
  } catch {
    return { name: "Generated Deck", description: "", strategy: "", deckList: raw };
  }
}

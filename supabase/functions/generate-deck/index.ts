// PhantomMTG — AI deck generation edge function.
// Returns: { name, description, strategy, deckList }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { format, style, colors, budget, notes } = await req.json();

    const AI_API_KEY = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("AI_API_KEY");
    if (!AI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing AI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AI_BASE_URL = Deno.env.get("AI_BASE_URL") || "https://api.openai.com/v1";
    const AI_MODEL = Deno.env.get("AI_MODEL") || "gpt-4o-mini";

    const colorNames: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
    const colorStr = colors?.length ? colors.map((c: string) => colorNames[c] ?? c).join(", ") : "any colors";

    const prompt = `You are a Magic: The Gathering deck building expert. Build a complete ${format} deck.

Parameters:
- Format: ${format}
- Playstyle: ${style}
- Colors: ${colorStr}
- Budget: ${budget}
${notes ? `- Additional notes: ${notes}` : ""}

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
  "deckList": "Deck\\n4 Lightning Bolt (M11) 149\\n..."
}`;

    const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 2000,
        messages: [
          { role: "system", content: "You are a concise MTG deck building expert. Always reply with raw JSON only, no markdown, no code fences." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI error: ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    let content: string = data.choices?.[0]?.message?.content ?? "{}";
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { name: "Generated Deck", description: "", strategy: "", deckList: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

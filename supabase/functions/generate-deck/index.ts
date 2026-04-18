// PhantomMTG - AI deck generation edge function (Anthropic Claude).
// Returns: { name, description, strategy, deckList }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { format, style, colors, budget, notes } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY. Add it in Supabase Dashboard > Project Settings > Edge Functions > Secrets." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
  "deckList": "Deck\n4 Lightning Bolt (M11) 149\n..."
}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: "You are a concise MTG deck building expert. Always reply with raw JSON only, no markdown, no code fences.",
        messages: [{ role: "user", content: prompt }],
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
    let content: string = data.content?.[0]?.text ?? "{}";
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

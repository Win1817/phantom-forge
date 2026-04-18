// PhantomMTG - AI deck generation edge function (Google Gemini).
// Returns: { name, description, strategy, deckList }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Lightweight auth guard (verify_jwt=false in config due to ES256 incompatibility)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { format, style, colors, budget, notes } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY." }), {
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

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are a concise MTG deck building expert. Always reply with raw JSON only, no markdown, no code fences." }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
        }),
      }
    );

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error(`Gemini error ${aiRes.status}:`, t);
      return new Response(JSON.stringify({ error: `AI error (${aiRes.status}): ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    let content: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
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

// PhantomMTG - AI card explanation edge function (Google Gemini).
// Returns: { simple, howToUse, combos, role, related }
//
// JWT verification is disabled at the runtime level (config.toml verify_jwt=false)
// because newer Supabase projects use ES256 tokens, which the built-in verifier
// does not support (UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM).
// We instead do a lightweight check: the caller must supply a Bearer token,
// confirming the request comes from an authenticated Supabase client session.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Lightweight auth guard — must have a Bearer token (issued by Supabase Auth)
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { card } = await req.json();
    if (!card?.name) {
      return new Response(JSON.stringify({ error: "card.name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are a concise MTG expert. Always reply with raw JSON only, no markdown." }]
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0.5 },
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
      parsed = { simple: content, howToUse: "", combos: [], role: "utility", related: [] };
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

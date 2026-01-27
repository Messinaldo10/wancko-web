import { NextResponse } from "next/server";

/**
 * AU PARSER v0
 */
function parseAU(input) {
  const text = input.toLowerCase();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen = text.includes("tired") || text.includes("empty") ? "DCN" : "RAV";

  let matrix = "3412";
  if (text.includes("should") || text.includes("must")) matrix = "1234";
  if (text.includes("why") || text.includes("doubt")) matrix = "2143";
  if (text.includes("let go") || text.includes("stop")) matrix = "4321";

  let N_level = "N3";
  if (text.includes("harm") || text.includes("force")) N_level = "N0";
  if (text.includes("panic") || text.includes("obsessed")) N_level = "N1";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  return { mode, screen, matrix, intervention, N_level };
}

export async function POST(req) {
  try {
    const { input } = await req.json();
    if (!input || input.length < 3) {
      return NextResponse.json({ output: null });
    }

    const au = parseAU(input);

    // BOOTSTRAP SILENCE (visible presence)
    if (au.intervention === "Silence") {
      return NextResponse.json({ output: "I am listening. Continue." });
    }

    // DEBUG (bypass OpenAI)
    if (process.env.DEBUG_WANCKO === "true") {
      return NextResponse.json({ output: "Wancko test response (debug)." });
    }

    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
INTERVENTION: ${au.intervention}

RULES:
- No advice
- No reassurance
- One short intervention
- Max 80 words

USER:
${input}
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Wancko’s language engine." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("OpenAI HTTP error:", res.status, t);
      return NextResponse.json({
        output: "I am here. Stay with the thread."
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim().length > 0) {
      return NextResponse.json({ output: content.trim() });
    }

    // AU-safe fallback (no empty)
    console.warn("OpenAI returned empty content:", data);
    return NextResponse.json({
      output: "I am here. Say a little more."
    });
  } catch (err) {
    console.error("Wancko fatal error:", err);
    return NextResponse.json({
      output: "I am here."
    });
  }
}

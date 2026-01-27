import { NextResponse } from "next/server";

/**
 * AU PARSER v0
 * Determinista, sin ML
 */
function parseAU(input) {
  const text = input.toLowerCase();

  // MODE
  const mode =
    text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN
  const screen =
    text.includes("tired") || text.includes("empty") ? "DCN" : "RAV";

  // MATRIX
  let matrix = "3412";
  if (text.includes("should") || text.includes("must")) matrix = "1234";
  if (text.includes("why") || text.includes("doubt")) matrix = "2143";
  if (text.includes("let go") || text.includes("stop")) matrix = "4321";

  // N LEVEL
  let N_level = "N3";
  if (text.includes("harm") || text.includes("force")) N_level = "N0";
  if (text.includes("panic") || text.includes("obsessed")) N_level = "N1";

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") {
    intervention = "Silence";
  } else if (text.includes("?")) {
    intervention = "StrategicQuestion";
  }

  return {
    mode,
    screen,
    matrix,
    intervention,
    N_level
  };
}

/**
 * POST /api/wancko
 */
export async function POST(req) {
  try {
    const { input } = await req.json();

    if (!input || input.length < 3) {
      return NextResponse.json({ output: null });
    }

    const au = parseAU(input);

    /**
     * BOOTSTRAP MODE
     * Silencio AU → presencia mínima
     */
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue."
      });
    }

    /**
     * DEBUG MODE (sin OpenAI)
     */
    if (process.env.DEBUG_WANCKO === "true") {
      return NextResponse.json({
        output: "Wancko test response. OpenAI call bypassed."
      });
    }

    /**
     * PROMPT CONTROLADO AU
     */
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
INTERVENTION: ${au.intervention}

RULES:
- No advice
- No reassurance
- No follow-up
- Max 120 words

USER EXPOSURE (abstracted):
${input}

TASK:
Produce a single, closed intervention.
`;

    const res = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are Wancko’s language engine."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3
        })
      }
    );

    const data = await res.json();
    const output =
      data?.choices?.[0]?.message?.content ||
      "I am here.";

    return NextResponse.json({ output });
  } catch (error) {
    // FALLBACK ABSOLUTO (nunca dejar al usuario colgado)
    return NextResponse.json({
      output: "I am here."
    });
  }
}

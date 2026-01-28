import { NextResponse } from "next/server";

/* ================= AU PARSER v0.1 ================= */
function parseAU(input) {
  const text = input.toLowerCase();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen = text.includes("tired") || text.includes("empty") ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (/(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text)) {
    matrix = "2143";
  } else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (text.includes("harm") || text.includes("force")) N_level = "N0";
  if (text.includes("panic") || text.includes("obsessed")) N_level = "N1";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  return { mode, screen, matrix, intervention, N_level };
}

/* ================= JURAMENTO ================= */
function applyJuramento(au, juramento) {
  if (!juramento) return au;

  const j = juramento.toLowerCase();
  const next = { ...au };

  if (["disciplina", "límites"].includes(j)) {
    if (next.matrix === "3412") next.matrix = "1234";
  }

  if (["ansiedad", "excesos"].includes(j)) {
    if (next.matrix === "1234") next.matrix = "2143";
  }

  if (["soltar"].includes(j)) {
    next.matrix = "4321";
  }

  return next;
}

/* ================= SIGNALS ================= */
function auSignals(au) {
  let tone = "amber";
  if (au.N_level === "N3") tone = "green";
  if (au.N_level === "N1" || au.N_level === "N0") tone = "red";

  const W =
    au.matrix === "1234" ? 0.35 :
    au.matrix === "2143" ? 0.55 :
    au.matrix === "4321" ? 0.65 :
    0.5;

  return { tone, W };
}

/* ================= SESSION ================= */
function nextSession(prev, au, juramento) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    juramento: juramento || base.juramento || null,
    turns: (base.turns || 0) + 1,
    silenceCount: au.intervention === "Silence" ? (base.silenceCount || 0) + 1 : base.silenceCount || 0,
    answerCount: au.intervention !== "Silence" ? (base.answerCount || 0) + 1 : base.answerCount || 0,
    last: au,
    chain: [
      ...chain.slice(-49),
      {
        t: Date.now(),
        mode: au.mode,
        screen: au.screen,
        matrix: au.matrix,
        N: au.N_level,
        intent: au.intervention
      }
    ]
  };
}

/* ================= API ================= */
export async function POST(req) {
  try {
    const { input, session, juramento } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    let au = parseAU(input);
    au = applyJuramento(au, juramento);

    const signals = auSignals(au);
    const newSession = nextSession(session, au, juramento);

    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue.",
        au: { ...au, signals },
        session: newSession
      });
    }

    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}

RULES:
- No advice
- No reassurance
- One short intervention
- Max 90 words

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

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({
      output: content || "I am here.",
      au: { ...au, signals },
      session: newSession
    });
  } catch (e) {
    console.error("Wancko API error:", e);
    return NextResponse.json({
      output: "I am here.",
      au: null,
      session: null
    });
  }
}


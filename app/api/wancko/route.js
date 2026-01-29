import { NextResponse } from "next/server";

/* ================= AU PARSER ================= */
function parseAU(input) {
  const text = input.toLowerCase();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen =
    /(tired|empty|burnout|agotado|vacío|cansado)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (/(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text)) {
    matrix = "2143";
  } else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (/(harm|violence|force|dañar|forzar)/.test(text)) N_level = "N0";
  else if (/(panic|obsessed|anxiety|pánico|obsesión|ansiedad)/.test(text)) N_level = "N1";

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
    next.screen = "DCN";
  }
  return next;
}

/* ================= GRADIENTES AU REALES ================= */
function auSignals(au, prev) {
  // Gradiente DCN↔RAV (no binario)
  let depth = au.screen === "DCN" ? 0.75 : 0.25;
  if (prev?.last?.screen === "DCN" && au.screen === "RAV") depth = 0.45;

  // W dinámico
  let W =
    au.matrix === "1234" ? 0.35 :
    au.matrix === "2143" ? 0.55 :
    au.matrix === "4321" ? 0.65 :
    0.5;

  // Ajuste por N
  if (au.N_level === "N1") W += 0.05;
  if (au.N_level === "N0") W += 0.1;

  let tone = "amber";
  if (depth < 0.35) tone = "green";
  if (depth > 0.65) tone = "red";

  return { tone, W, depth };
}

/* ================= ARPI (META-CADENA) ================= */
function arpiMeta(prev, au, signals) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    last: au,
    chain: [
      ...chain.slice(-49),
      {
        t: Date.now(),
        m: au.mode,
        s: au.screen,
        x: au.matrix,
        n: au.N_level,
        w: Number(signals.W.toFixed(2)),
        d: Number(signals.depth.toFixed(2))
      }
    ]
  };
}

/* ================= INTERPRETACIÓN HISTÓRICA ================= */
function interpretHistorical(historicalText, au) {
  // No empatía, no terapia: interpretación AU directa
  if (au.matrix === "1234") {
    return "The historical voice points to a lack of structure, not emotion.";
  }
  if (au.matrix === "2143") {
    return "The contrast reveals an assumption you have not inverted yet.";
  }
  if (au.matrix === "4321") {
    return "This is a signal to release control, not to seek explanation.";
  }
  return "The contrast highlights movement without direction.";
}

/* ================= API ================= */
export async function POST(req) {
  try {
    const { input, session, juramento, historical } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session });
    }

    let au = parseAU(input);
    au = applyJuramento(au, juramento);

    const signals = auSignals(au, session);
    const newSession = arpiMeta(session, au, signals);

    // SILENCIO
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue.",
        au: { ...au, signals },
        session: newSession
      });
    }

    // INTERPRETACIÓN HISTÓRICA (doble acto)
    if (historical) {
      const interpreted = interpretHistorical(historical, au);
      return NextResponse.json({
        output: interpreted,
        au: { ...au, signals },
        session: newSession
      });
    }

    // RESPUESTA NORMAL (OpenAI)
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}

RULES:
- No advice
- No reassurance
- One closed intervention
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
    console.error(e);
    return NextResponse.json({ output: "I am here.", au: null, session: null });
  }
}

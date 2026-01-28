import { NextResponse } from "next/server";

/** ---------- AU PARSER v0 (tu base) ---------- */
function parseAU(input) {
  const text = input.toLowerCase();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen = text.includes("tired") || text.includes("empty") ? "DCN" : "RAV";

  let matrix = "3412";

// EN / ES / CA — estructura (norma)
if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
  matrix = "1234";
}

// EN / ES / CA — inversión / duda
else if (/(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text)) {
  matrix = "2143";
}

// EN / ES / CA — disolución / ruptura
else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
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

/** ---------- Strategic Question (LOCAL, sin OpenAI) ---------- */
function strategicQuestion(au, lang = "en") {
  // 1 sola pregunta. Cerrada. Sin “follow-up”.
  const { mode, screen, matrix } = au;

  // DCN (ruptura) prioriza desprendimiento
  if (screen === "DCN") {
    if (matrix === "4321") return "What are you trying to release, exactly?";
    if (matrix === "2143") return "What flips if you assume the opposite is true for one minute?";
    return "What is the smallest thing you can stop feeding today?";
  }

  // RAV (continuidad) prioriza ajuste y ejecución
  if (mode === "GM") {
    if (matrix === "1234") return "What would be the simplest rule that everyone could actually follow?";
    if (matrix === "2143") return "Which assumption in the group is carrying the most tension?";
    return "What changes first if the collective goal becomes clearer than the individual one?";
  }

  // GC + RAV
  if (matrix === "1234") return "What is the next concrete step that costs the least and proves direction?";
  if (matrix === "2143") return "What is the one belief you’re protecting that might be the cause?";
  if (matrix === "4321") return "What would you stop doing if you trusted your direction?";
  return "What’s the real decision you are avoiding naming?";
}

/** ---------- AU Visual Signals (simple) ---------- */
function auSignals(au) {
  // RAV: green/amber/red base; DCN: night/dusk/day metaphor but we keep it simple
  let tone = "amber";
  if (au.N_level === "N3") tone = "green";
  if (au.N_level === "N2") tone = "amber";
  if (au.N_level === "N1") tone = "red";
  if (au.N_level === "N0") tone = "red";

  // W proxy: ratio reason/truth keywords (v0). Keep 0..1
  // (sin texto guardado: solo se calcula al vuelo)
  const W = au.matrix === "1234" ? 0.35 : au.matrix === "2143" ? 0.55 : au.matrix === "3412" ? 0.5 : 0.65;

  return { tone, W };
}

/** ---------- Session (ARPI meta only) ---------- */
function nextSession(prev, au) {
  const base = prev && typeof prev === "object" ? prev : {};

  const chain = Array.isArray(base.chain) ? base.chain : [];
  const next = {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: au,
    // chain item: no text, only meta
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

  if (au.intervention === "Silence") next.silenceCount += 1;
  else next.answerCount += 1;

  return next;
}

export async function POST(req) {
  try {
    const { input, session } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session: session || null });
    }

    const au = parseAU(input);
    const signals = auSignals(au);
    const newSession = nextSession(session, au);

    // SILENCE bootstrap (presencia mínima)
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue.",
        au: { ...au, signals },
        session: newSession
      });
    }

    // StrategicQuestion local (sin OpenAI)
    if (au.intervention === "StrategicQuestion") {
      return NextResponse.json({
        output: strategicQuestion(au),
        au: { ...au, signals },
        session: newSession
      });
    }

    // ANSWER via OpenAI (subordinado)
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}

RULES:
- No advice
- No reassurance
- No follow-up invitation
- One short intervention
- Max 90 words

USER:
${input}

TASK:
Produce a single, closed intervention.
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
        output: "I am here. Say a little more.",
        au: { ...au, signals },
        session: newSession
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({
      output: content && content.length ? content : "I am here. Say a little more.",
      au: { ...au, signals },
      session: newSession
    });
  } catch (err) {
    console.error("Wancko fatal error:", err);
    return NextResponse.json({
      output: "I am here.",
      au: null,
      session: null
    });
  }
}

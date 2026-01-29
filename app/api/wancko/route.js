import { NextResponse } from "next/server";

/** ---------- AU PARSER v0.2 ---------- */
function parseAU(input) {
  const text = input.toLowerCase();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen = text.includes("tired") || text.includes("empty") ? "DCN" : "RAV";

  let matrix = "3412";

  // estructura
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }
  // inversión
  else if (/(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text)) {
    matrix = "2143";
  }
  // disolución
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (text.includes("panic") || text.includes("obsessed")) N_level = "N1";
  if (text.includes("harm") || text.includes("force")) N_level = "N0";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  // 🔁 OPERADOR DE SENTIDO (AU)
  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- STRATEGIC QUESTIONS (MULTILENGUA) ---------- */
const SQ = {
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule that everyone could actually follow?",
    groupAssumption: "Which assumption in the group is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
    step: "What is the next concrete step that costs the least and proves direction?",
    belief: "What belief are you protecting that might be the cause?",
    trust: "What would you stop doing if you trusted your direction?",
    decision: "What’s the real decision you are avoiding naming?"
  },
  es: {
    release: "¿Qué estás intentando soltar exactamente?",
    invert: "¿Qué cambia si asumes que lo contrario es cierto durante un minuto?",
    stop: "¿Qué es lo más pequeño que podrías dejar de alimentar hoy?",
    rule: "¿Cuál sería la regla más simple que todos podrían seguir de verdad?",
    groupAssumption: "¿Qué suposición del grupo está cargando más tensión?",
    collective: "¿Qué cambia primero si el objetivo colectivo se vuelve más claro que el individual?",
    step: "¿Cuál es el siguiente paso concreto que cuesta menos y demuestra dirección?",
    belief: "¿Qué creencia estás protegiendo que podría ser la causa?",
    trust: "¿Qué dejarías de hacer si confiaras en tu dirección?",
    decision: "¿Qué decisión real estás evitando nombrar?"
  },
  ca: {
    release: "Què estàs intentant deixar anar exactament?",
    invert: "Què canvia si assumes que el contrari és cert durant un minut?",
    stop: "Quina és la cosa més petita que podries deixar d’alimentar avui?",
    rule: "Quina seria la norma més simple que tothom podria seguir de veritat?",
    groupAssumption: "Quina suposició del grup carrega més tensió?",
    collective: "Què canvia primer si l’objectiu col·lectiu esdevé més clar que l’individual?",
    step: "Quin és el següent pas concret que costa menys i demostra direcció?",
    belief: "Quina creença estàs protegint que podria ser la causa?",
    trust: "Què deixaries de fer si confiessis en la teva direcció?",
    decision: "Quina decisió real estàs evitant anomenar?"
  }
};

function strategicQuestion(au, lang) {
  const L = SQ[lang] ? lang : "en";
  const { mode, screen, matrix } = au;

  if (screen === "DCN") {
    if (matrix === "4321") return SQ[L].release;
    if (matrix === "2143") return SQ[L].invert;
    return SQ[L].stop;
  }

  if (mode === "GM") {
    if (matrix === "1234") return SQ[L].rule;
    if (matrix === "2143") return SQ[L].groupAssumption;
    return SQ[L].collective;
  }

  if (matrix === "1234") return SQ[L].step;
  if (matrix === "2143") return SQ[L].belief;
  if (matrix === "4321") return SQ[L].trust;
  return SQ[L].decision;
}

/** ---------- GRADIENTE AU ---------- */
function auSignals(au) {
  let d = 0.45; // crepúsculo base

  if (au.matrix === "1234") d = 0.25;
  if (au.matrix === "3412") d = 0.45;
  if (au.matrix === "4321") d = 0.75;

  let tone = "amber";
  if (d <= 0.3) tone = "green";
  if (d >= 0.7) tone = "red";

  return { d, tone, sense: au.sense };
}

/** ---------- SESSION / ARPI ---------- */
function nextSession(prev, au, signals) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals },
    chain: [
      ...chain.slice(-4),
      {
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        intent: au.intervention
      }
    ]
  };
}

/** ---------- ANTI-LOOP AU v1 ---------- */
function antiLoopDecision(session) {
  if (!session || !Array.isArray(session.chain)) return null;
  const c = session.chain;

  // mismo patrón 3 veces
  if (
    c.length >= 3 &&
    c[c.length - 1].matrix === c[c.length - 2].matrix &&
    c[c.length - 2].matrix === c[c.length - 3].matrix &&
    c[c.length - 1].sense === c[c.length - 2].sense
  ) {
    return "shorten";
  }

  // N1 dos veces
  if (c.filter(x => x.N === "N1").length >= 2) {
    return "silence";
  }

  // d no se mueve
  if (
    c.length >= 3 &&
    Math.abs(c[c.length - 1].d - c[c.length - 3].d) < 0.1
  ) {
    return "invert";
  }

  return null;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const { input, session } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    const au = parseAU(input);
    const signals = auSignals(au);
    let newSession = nextSession(session, au, signals);

    const anti = antiLoopDecision(newSession);

    // SILENCIO
    if (au.intervention === "Silence" || anti === "silence") {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession
      });
    }

    // PREGUNTA ESTRATÉGICA
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);
      if (anti === "shorten") q = q.split("?")[0] + "?";
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession
      });
    }

    // ANSWER (OpenAI)
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}

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

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";
    if (anti === "shorten") out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null });
  }
}

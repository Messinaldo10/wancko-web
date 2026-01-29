import { NextResponse } from "next/server";

/** ---------- AU PARSER v0.3 ---------- */
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

  // Operador de sentido
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

/** ---------- W (Reason ↔ Truth) proxy v0.1 ---------- */
function computeW(input, au) {
  // v0.1: solo señales por tipo de matriz (estable y visible)
  if (au.matrix === "1234") return 0.35;
  if (au.matrix === "2143") return 0.55;
  if (au.matrix === "4321") return 0.65;
  return 0.5; // 3412
}

/** ---------- GRADIENTE AU + señales ---------- */
function auSignals(au, session, input) {
  // d base por matriz
  let d =
    au.matrix === "1234" ? 0.2 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.55 :
    au.matrix === "4321" ? 0.75 :
    0.45;

  // ajuste por screen
  if (au.screen === "DCN") d += 0.1;

  // clamp
  d = Math.max(0, Math.min(1, d));

  // tono por d (continuidad/ruptura)
  let tone = "amber";
  if (d < 0.3) tone = "green";
  if (d > 0.65) tone = "red";

  // W
  const W = computeW(input, au);

  // anti-loop base (simple)
  let anti = null;
  if (session?.last?.matrix === au.matrix && session?.last?.sense === au.sense) {
    anti = "hold";
  }

  return { d, tone, W, sense: au.sense, anti };
}

/** ---------- SESSION (ARPI meta only) ---------- */
function nextSession(prev, au, signals) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { matrix: au.matrix, sense: au.sense, N: au.N_level, d: signals.d, intent: au.intervention },
    chain: [
      ...chain.slice(-19),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        intent: au.intervention
      }
    ]
  };

  return next;
}

/** ---------- ANTI-LOOP AU v1 ---------- */
function antiLoopDecision(session) {
  if (!session || !Array.isArray(session.chain)) return null;
  const c = session.chain;

  // mismo patrón 3 veces seguidas
  if (
    c.length >= 3 &&
    c[c.length - 1].matrix === c[c.length - 2].matrix &&
    c[c.length - 2].matrix === c[c.length - 3].matrix &&
    c[c.length - 1].sense === c[c.length - 2].sense
  ) {
    return "shorten";
  }

  // N1 dos veces en ventana
  const last5 = c.slice(-5);
  if (last5.filter(x => x.N === "N1").length >= 2) {
    return "silence";
  }

  // d no se mueve (bloqueo suave)
  if (
    c.length >= 3 &&
    Math.abs(c[c.length - 1].d - c[c.length - 3].d) < 0.1
  ) {
    return "invert";
  }

  return null;
}

/** ---------- ARPI (inicio de certificación, sin datos) ---------- */
function computeARPI(session) {
  if (!session || !Array.isArray(session.chain)) return { level: "seed" };

  if ((session.turns || 0) < 3) return { level: "seed" };

  const last7 = session.chain.slice(-7);
  const hasN0 = last7.some(x => x.N === "N0");
  const n1count = last7.filter(x => x.N === "N1").length;

  if (hasN0) return { level: "blocked" };
  if (n1count >= 2) return { level: "unstable" };

  // criterio simple: suficiente historial sin bloqueos
  if ((session.turns || 0) >= 7) return { level: "ok" };

  return { level: "seed" };
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;

    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session, cert: { level: "seed" } });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    const au = parseAU(input);

    // IMPORTANT: signals necesita session + input
    const signals = auSignals(au, session, input);

    let newSession = nextSession(session, au, signals);

    // anti-loop se decide con sesión ya actualizada
    const anti = antiLoopDecision(newSession);

    // si anti == invert, forzamos lectura inversa (sin cambiar matrix)
    const effectiveSense = anti === "invert" ? "inverse" : au.sense;

    const effectiveAu = { ...au, sense: effectiveSense };
    const effectiveSignals = { ...signals, sense: effectiveSense, anti };

    // SILENCIO (AU / anti-loop)
    if (effectiveAu.intervention === "Silence" || anti === "silence") {
      newSession.silenceCount += 1;
      const cert = computeARPI(newSession);
      return NextResponse.json({
        output: "—",
        au: { ...effectiveAu, signals: effectiveSignals },
        session: newSession,
        cert
      });
    }

    // PREGUNTA ESTRATÉGICA
    if (effectiveAu.intervention === "StrategicQuestion") {
      let q = strategicQuestion(effectiveAu, lang);
      if (anti === "shorten") q = q.split("?")[0] + "?";
      newSession.answerCount += 1;
      const cert = computeARPI(newSession);
      return NextResponse.json({
        output: q,
        au: { ...effectiveAu, signals: effectiveSignals },
        session: newSession,
        cert
      });
    }

    // ANSWER (OpenAI)
    const prompt = `
MODE: ${effectiveAu.mode}
SCREEN: ${effectiveAu.screen}
MATRIX: ${effectiveAu.matrix}
SENSE: ${effectiveAu.sense}

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
      newSession.answerCount += 1;
      const cert = computeARPI(newSession);
      return NextResponse.json({
        output: "—",
        au: { ...effectiveAu, signals: effectiveSignals },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";
    if (anti === "shorten") out = out.split(".")[0] + ".";

    newSession.answerCount += 1;
    const cert = computeARPI(newSession);

    return NextResponse.json({
      output: out,
      au: { ...effectiveAu, signals: effectiveSignals },
      session: newSession,
      cert
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

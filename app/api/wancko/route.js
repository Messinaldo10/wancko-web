import { NextResponse } from "next/server";

/** ---------- AU PARSER v0.1 ---------- */
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

/** ---------- Strategic Question (MULTILENGUA, LOCAL) ---------- */
const SQ = {
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule that everyone could actually follow?",
    groupAssumption: "Which assumption in the group is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
    step: "What is the next concrete step that costs the least and proves direction?",
    belief: "What is the one belief you’re protecting that might be the cause?",
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

function strategicQuestion(au, lang = "en") {
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

/** ---------- AU Visual Signals ---------- */
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

/** ---------- DOUBLE ACT AU (NIVEL 2) ---------- */
function allowSecondAct(prevSession, au) {
  if (!prevSession || !prevSession.last) return false;

  const last = prevSession.last;

  if (last.matrix !== au.matrix) return true;
  if (last.N_level !== au.N_level) return true;

  if (au.intervention === "StrategicQuestion" && last.intent === "Answer") {
    return true;
  }

  return false;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const { input, session } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session: session || null });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    const au = parseAU(input);
    const signals = auSignals(au);
    const newSession = nextSession(session, au);

    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue.",
        au: { ...au, signals },
        session: newSession
      });
    }

    if (au.intervention === "StrategicQuestion") {
      const first = strategicQuestion(au, lang);
      const secondAllowed = allowSecondAct(session, au);
      const output = secondAllowed ? `${first}\n\n—` : first;

      return NextResponse.json({
        output,
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
  } catch {
    return NextResponse.json({
      output: "I am here.",
      au: null,
      session: null
    });
  }
}

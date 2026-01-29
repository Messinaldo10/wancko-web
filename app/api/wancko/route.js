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
  const j = String(juramento).toLowerCase();
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

/* ================= MULTILENGUA (para SQ local) ================= */
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

function detectLang(req) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  if (l === "es" || l === "ca" || l === "en") return l;
  return "en";
}

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

/* ================= GRADIENTES AU REALES ================= */
function auSignals(au, prev) {
  // depth: 0..1 (Continuidad → Ruptura)
  let depth = au.screen === "DCN" ? 0.75 : 0.25;

  // transición suave si vienes de DCN y vuelves a RAV
  if (prev?.last?.screen === "DCN" && au.screen === "RAV") depth = 0.45;

  // W por matriz (0..1)
  let W =
    au.matrix === "1234" ? 0.35 :
    au.matrix === "2143" ? 0.55 :
    au.matrix === "4321" ? 0.65 :
    0.5;

  // ajuste por N (más presión → desplaza W)
  if (au.N_level === "N1") W = Math.min(1, W + 0.05);
  if (au.N_level === "N0") W = Math.min(1, W + 0.10);

  // tone según depth
  let tone = "amber";
  if (depth < 0.35) tone = "green";
  if (depth > 0.65) tone = "red";

  return {
    tone,
    W: Number(W.toFixed(2)),
    depth: Number(depth.toFixed(2))
  };
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
        w: signals.W,
        d: signals.depth
      }
    ]
  };
}

/* ================= ANTI-LOOP (ARPI) ================= */
function antiLoopAdjust(prevSession, au) {
  const chain = prevSession?.chain;
  if (!Array.isArray(chain) || chain.length < 3) return au;

  const a = chain[chain.length - 1];
  const b = chain[chain.length - 2];
  const c = chain[chain.length - 3];

  const same =
    a?.x === b?.x && b?.x === c?.x &&
    a?.s === b?.s && b?.s === c?.s &&
    a?.n === b?.n && b?.n === c?.n;

  if (!same) return au;

  // Si estamos repitiendo lo mismo 3 veces seguidas:
  // - forzamos alternancia: Question ↔ Answer
  const next = { ...au };

  if (next.intervention === "StrategicQuestion") next.intervention = "Answer";
  else if (next.intervention === "Answer") next.intervention = "StrategicQuestion";

  return next;
}

/* ================= HISTÓRICO → INTERPRETACIÓN AU ================= */
function interpretHistorical(historicalText, au, lang = "en") {
  // interpretación AU seca (sin terapia, sin empatía)
  const L = SQ[lang] ? lang : "en";

  if (au.matrix === "1234") {
    return L === "es"
      ? "Esa voz histórica apunta a estructura: falta norma, no emoción."
      : L === "ca"
      ? "Aquesta veu històrica apunta a estructura: falta norma, no emoció."
      : "That historical voice points to structure: lack of rule, not emotion.";
  }

  if (au.matrix === "2143") {
    return L === "es"
      ? "El contraste revela una suposición que aún no has invertido."
      : L === "ca"
      ? "El contrast revela una suposició que encara no has invertit."
      : "The contrast reveals an assumption you have not inverted yet.";
  }

  if (au.matrix === "4321") {
    return L === "es"
      ? "Señal de soltar control, no de buscar explicación."
      : L === "ca"
      ? "Senyal de deixar anar control, no de buscar explicació."
      : "This signals releasing control, not seeking explanation.";
  }

  return L === "es"
    ? "El contraste muestra movimiento sin dirección."
    : L === "ca"
    ? "El contrast mostra moviment sense direcció."
    : "The contrast highlights movement without direction.";
}

/* ================= ARPI “CERT STATUS” (sin datos) ================= */
function certStatus(session) {
  const chain = session?.chain;
  if (!Array.isArray(chain) || chain.length < 3) return { level: "seed" };

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((e) => e?.n === "N0");
  const hasN1 = last5.some((e) => e?.n === "N1");

  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  return { level: "ok" };
}

/* ================= API ================= */
export async function POST(req) {
  try {
    const lang = detectLang(req);
    const { input, session, juramento, historical } = await req.json();

    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session });
    }

    let au = parseAU(input);
    au = applyJuramento(au, juramento);

    // Anti-loop: usa ARPI previo (si existe) para alternar intervención
    au = antiLoopAdjust(session, au);

    const signals = auSignals(au, session);
    const newSession = arpiMeta(session, au, signals);
    const cert = certStatus(newSession);

    // Silencio
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "I am listening. Continue.",
        au: { ...au, signals },
        session: newSession,
        cert
      });
    }

    // Interpretación histórica (doble acto)
    if (historical) {
      const interpreted = interpretHistorical(historical, au, lang);
      return NextResponse.json({
        output: interpreted,
        au: { ...au, signals },
        session: newSession,
        cert
      });
    }

    // Pregunta estratégica local (multilengua) para variar carga
    if (au.intervention === "StrategicQuestion") {
      const q = strategicQuestion(au, lang);
      return NextResponse.json({
        output: q,
        au: { ...au, signals },
        session: newSession,
        cert
      });
    }

    // Respuesta OpenAI
    const prompt =
      "MODE: " + au.mode + "\n" +
      "SCREEN: " + au.screen + "\n" +
      "MATRIX: " + au.matrix + "\n\n" +
      "RULES:\n" +
      "- No advice\n" +
      "- No reassurance\n" +
      "- One closed intervention\n" +
      "- Max 90 words\n\n" +
      "USER:\n" + input;

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
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({
      output: content || "I am here.",
      au: { ...au, signals },
      session: newSession,
      cert
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ output: "I am here.", au: null, session: null });
  }
}

import { NextResponse } from "next/server";
import { initLog, appendLog } from "../../../lib/au-log.js";
import { evaluateMirror, arpiFromTrajectory } from "../../../lib/arpi-evaluator.js";

/** =========================================================
 *  WANCKO API — AU v0.5 (trayectoria real)
 *  - Juramento modula matriz (coherencia AU)
 *  - Anti-loop rompe bucles (decisiones útiles, NO "hold" constante)
 *  - Gradiente d / tone + W visibles (cambian de verdad)
 *  - Cert ARPI por trayectoria espejo (no por estado puntual)
 *  - Registro conversacional (meta + texto) preparado para crecer a RAG AU interno
 * ========================================================= */

/** ---------- AU PARSER v0.3.1+ ---------- */
function parseAU(input) {
  const text = String(input || "").toLowerCase().trim();

  // MODE
  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|sin fuerzas|no puedo más)/.test(text)
      ? "DCN"
      : "RAV";

  // MATRIX default
  let matrix = "3412";

  // 1234 estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }
  // 2143 inversión / ontología / duda (incluye preguntas cortas)
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|qué significa|que significa)/.test(text)
  ) {
    matrix = "2143";
  }
  // 4321 disolución / soltar
  else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou|ya no quiero|no aguanto)/.test(text)
  ) {
    matrix = "4321";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pánico|rumiar|no paro)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|suicid|matar|golpear)/.test(text)) N_level = "N0";

  // degradación suave (pregunta repetida corta)
  if (/\?$/.test(text) && text.length < 45 && N_level === "N3") {
    N_level = "N2";
  }

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- STRATEGIC QUESTIONS (multilengua) ---------- */
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

/** ---------- Juramento como operador AU ---------- */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = String(juramento).toLowerCase().trim();

  if (j === "disciplina") {
    if (matrix === "4321") return "3412";
    return "1234";
  }

  if (j === "ansiedad") {
    return "2143";
  }

  if (j === "límites" || j === "limites") {
    if (screen === "DCN") return "2143";
    if (matrix === "4321") return "3412";
    return matrix;
  }

  if (j === "excesos") {
    if (matrix === "3412") return "4321";
    return matrix;
  }

  if (j === "soltar") {
    return "4321";
  }

  return matrix;
}

/** ---------- Util repetición ---------- */
function recentRepeatCount(chain, matrix, window = 5) {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

/** ---------- Anti-loop (decisiones útiles) ---------- */
function antiLoopDecision(prevSession, currentAu) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, currentAu.matrix, 5);

  const last8 = chain.slice(-8);
  const hasN0 = last8.some((x) => x?.N === "N0");
  const n1Count = last8.filter((x) => x?.N === "N1").length;
  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  // 3 repeticiones seguidas → romper
  if (rep >= 3) return "break";

  // duda repetida → aterrizar
  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && currentAu.matrix === "2143" && rep >= 2) return "ground";

  return null;
}

/** ---------- aplica anti-loop a matriz ---------- */
function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return juramento === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "ground") return "3412";

  return matrix;
}

/** ---------- Signals AU (d/tone/W) que se mueven de verdad ---------- */
function auSignals(au, prevSession, juramento) {
  // Base por matriz
  let d =
    au.matrix === "1234" ? 0.18 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.86 :
    0.45;

  // Screen empuja hacia ruptura
  if (au.screen === "DCN") d += 0.10;

  // Juramento bias (coherencia visible)
  const j = juramento ? String(juramento).toLowerCase().trim() : "";
  if (j === "disciplina") d -= 0.08;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.10;
  if (j === "soltar") d += 0.14;
  if (j === "límites" || j === "limites") d -= 0.03;

  // Repetición reciente (tensión de estancamiento)
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.07;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  // Clamp
  d = Math.max(0, Math.min(1, d));

  // Tonos agresivos para que se vean
  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W bar (no igual a d)
  let W =
    au.matrix === "1234" ? 0.28 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.82 :
    0.50;

  if (au.screen === "DCN") W += 0.06;
  if (j === "disciplina") W -= 0.06;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.03;

  W = Math.max(0, Math.min(1, W));

  return { d, tone, sense: au.sense, W };
}

/** ---------- Session (mantiene tu estructura + añade log/mirror) ---------- */
function nextSession(prev, au, signals, anti, nextLogState, mirror) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals, anti },
    chain: [
      ...chain.slice(-19),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        intent: au.intervention,
        anti: anti || null
      }
    ],
    // === NUEVO: trayectoria ===
    log: nextLogState.log,
    mirror: mirror,
    stableCount: nextLogState.stableCount || 0
  };
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;
    const historical = body?.historical || null;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({
        output: null,
        au: null,
        session,
        cert: { level: "seed" }
      });
    }

    // Idioma: si el cliente lo manda, lo usamos; si no, accept-language.
    const langRaw = body?.lang || req.headers.get("accept-language") || "en";
    const lang = String(langRaw).slice(0, 2).toLowerCase();

    // 1) parse por texto
    let au = parseAU(input);

    // 2) juramento modula matriz
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 3) anti-loop decide
    const anti = antiLoopDecision(session, au);

    // 4) anti-loop ajusta matriz si procede
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) signals (d/tone/W)
    const signals = auSignals(au, session, juramento);

    // 6) trayectoria (log + mirror)
    const logState = initLog(session || {});
    const mirror = evaluateMirror(logState.mirror, au, signals, anti);

    let nextLog = appendLog(
      { ...logState, mirror },
      {
        role: "user",
        text: String(input),
        matrix: au.matrix,
        d: signals.d,
        W: signals.W,
        tone: signals.tone,
        sense: au.sense,
        N: au.N_level,
        anti: anti || null
      }
    );

    // Si hay acto histórico, lo registramos también (para espejo)
    if (historical && String(historical).trim().length > 0) {
      nextLog = appendLog(nextLog, {
        role: "h-wancko",
        text: String(historical),
        matrix: au.matrix,
        d: signals.d,
        W: signals.W,
        tone: signals.tone,
        sense: au.sense,
        N: au.N_level,
        anti: anti || null
      });
    }

    // 7) session nueva
    let newSession = nextSession(session, au, signals, anti, nextLog, mirror);

    // 8) cert por trayectoria
    const cert = arpiFromTrajectory(newSession);

    // 9) intervención efectiva
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";

    // SILENCE
    if (effectiveSilence) {
      newSession.silenceCount += 1;
      // Registramos también el output silencioso como evento
      newSession.log = appendLog({ log: newSession.log, mirror: newSession.mirror }, {
        role: "wancko",
        text: "—",
        matrix: au.matrix,
        d: signals.d,
        W: signals.W,
        tone: signals.tone,
        sense: au.sense,
        N: au.N_level,
        anti: anti || null
      }).log;

      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    // STRATEGIC QUESTION (local)
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);

      if (anti === "break") q = q.split("\n")[0];

      newSession.answerCount += 1;
      newSession.log = appendLog({ log: newSession.log, mirror: newSession.mirror }, {
        role: "wancko",
        text: q,
        matrix: au.matrix,
        d: signals.d,
        W: signals.W,
        tone: signals.tone,
        sense: au.sense,
        N: au.N_level,
        anti: anti || null
      }).log;

      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    // ANSWER (OpenAI) — con subjetividad visible por juramento + AU
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
ANTI: ${anti || "none"}
MIRROR: ${mirror.toFixed(2)}

RULES:
- No advice.
- No reassurance.
- No "follow-up invitation".
- 1 intervention, 1-3 sentences max.
- Max 90 words.
- Make the difference of JURAMENTO clearly noticeable in tone/angle (still closed).
- Match user language (${lang}) unless the user clearly wrote in another language.

USER:
${input}

${historical ? `H-WANCKO (context, do not copy verbatim): ${String(historical).slice(0, 280)}` : ""}

TASK:
Produce a single, closed intervention with a human cadence (not robotic).
`.trim();

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
        temperature: 0.55
      })
    });

    if (!res.ok) {
      const fallback = "—";
      newSession.answerCount += 1;
      newSession.log = appendLog({ log: newSession.log, mirror: newSession.mirror }, {
        role: "wancko",
        text: fallback,
        matrix: au.matrix,
        d: signals.d,
        W: signals.W,
        tone: signals.tone,
        sense: au.sense,
        N: au.N_level,
        anti: anti || null
      }).log;

      return NextResponse.json({
        output: fallback,
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: acorta un poco para romper bucle
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    // log output
    newSession.log = appendLog({ log: newSession.log, mirror: newSession.mirror }, {
      role: "wancko",
      text: out,
      matrix: au.matrix,
      d: signals.d,
      W: signals.W,
      tone: signals.tone,
      sense: au.sense,
      N: au.N_level,
      anti: anti || null
    }).log;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert,
      mirror
    });
  } catch (e) {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null,
      cert: { level: "seed" },
      mirror: 0
    });
  }
}

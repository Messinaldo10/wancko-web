import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU v0.4 (coherencia AU aplicada)
 *  - Juramento modula la lectura (matriz) sin depender solo del texto
 *  - Gradiente d y tono cambian de verdad
 *  - Anti-loop deja de ser "hold" constante y pasa a decisiones útiles
 *  - ARPI cert (semilla/ok/inestable/bloqueado) sin exponer datos
 * ========================================================= */

/** ---------- AU PARSER v0.3.1 (tu base) ---------- */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  // MODE
  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  // MATRIX (por defecto continuidad)
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }

  // 2143 — inversión / ontología / duda
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  }

  // 4321 — disolución
  else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)
  ) {
    matrix = "4321";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  // degradación suave por repetición conceptual
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") {
    N_level = "N2";
  }

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- STRATEGIC QUESTIONS ---------- */
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

/** =========================================================
 *  COHERENCIA AU — Juramento como operador (núcleo)
 *  La misma frase produce matrices distintas según juramento.
 * ========================================================= */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;

  // Normalizamos algunos casos que llegan con acentos / variantes
  const j = String(juramento).toLowerCase().trim();

  if (j === "disciplina") {
    // Disciplina empuja a estructura; si venía ruptura la baja a continuidad
    if (matrix === "4321") return "3412";
    return "1234";
  }

  if (j === "ansiedad") {
    // Ansiedad lee presión/inversión casi siempre
    if (matrix === "4321") return "2143";
    return "2143";
  }

  if (j === "límites" || j === "limites") {
    // Límites: evita 4321 salvo DCN; en DCN tiende a 2143 (tensión) antes de disolver
    if (screen === "DCN") return "2143";
    if (matrix === "4321") return "3412";
    return matrix;
  }

  if (j === "excesos") {
    // Excesos facilita salto a disolución si hay continuidad neutra
    if (matrix === "3412") return "4321";
    return matrix;
  }

  if (j === "soltar") {
    // Soltar prioriza disolución siempre
    return "4321";
  }

  return matrix;
}

/** ---------- util: cuenta repeticiones recientes ---------- */
function recentRepeatCount(chain, matrix, window = 4) {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

/** =========================================================
 *  ANTI-LOOP — decisiones (no “hold” constante)
 *  - si 3 veces misma matriz -> fuerza cambio de operador
 *  - si N1 repetido -> silencio
 *  - si estancamiento d -> inversión
 * ========================================================= */
function antiLoopDecision(prevSession, currentAu) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, currentAu.matrix, 4);

  // N1 dos veces en la ventana corta => silencio (seguridad)
  const n1Count = chain.slice(-5).filter((x) => x?.N === "N1").length;
  const n0Count = chain.slice(-5).filter((x) => x?.N === "N0").length;
  if (n0Count >= 1) return "silence";
  if (n1Count >= 2) return "silence";

  // 3 repeticiones => romper bucle: invertir lectura (2143) o volver a continuidad (3412)
  if (rep >= 3) return "break";

  // Si venimos de 2143 repetido => bajar a 3412 (salir de duda)
  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && currentAu.matrix === "2143" && rep >= 2) return "ground";

  return null;
}

/** ---------- aplica anti-loop a la matriz (controlado) ---------- */
function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  // "break": rota entre familias sin destruir juramento
  if (anti === "break") {
    // Si estaba en continuidad neutra, fuerza inversión (ver el supuesto)
    if (matrix === "3412") return "2143";
    // Si estaba en estructura rígida, baja a continuidad (respirar)
    if (matrix === "1234") return "3412";
    // Si estaba en inversión, sube a estructura (cerrar)
    if (matrix === "2143") return juramento === "ansiedad" ? "2143" : "1234";
    // Si estaba en disolución, aterriza
    if (matrix === "4321") return "3412";
  }

  if (anti === "ground") return "3412";

  return matrix;
}

/** =========================================================
 *  GRADIENTE AU — d, tono + W (barra)
 *  d ya no queda fijo: se mueve por:
 *  - matrix base
 *  - screen
 *  - juramento (bias)
 *  - repetición (tensión acumulada)
 * ========================================================= */
function auSignals(au, prevSession, juramento) {
  // Base por matriz
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.80 :
    0.45;

  // Screen empuja hacia ruptura
  if (au.screen === "DCN") d += 0.08;

  // Juramento sesga el gradiente (coherencia)
  const j = juramento ? String(juramento).toLowerCase().trim() : "";
  if (j === "disciplina") d -= 0.06;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;
  if (j === "límites" || j === "limites") d -= 0.02;

  // Repetición reciente (tensión o consolidación)
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 4);

  // Si repites 3412/2143 sin salir, sube un poco d (tensión de bucle)
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.06;
  // Si repites 1234, baja un poco (consolidación)
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  // Clamp
  d = Math.max(0, Math.min(1, d));

  // Color por d (más agresivo para que se vea)
  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W (barra reason↔truth): mapea a una zona distinta (no igual a d)
  // 0 = razón/estructura, 1 = verdad/disolución
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.62 :
    au.matrix === "4321" ? 0.78 :
    0.50;

  // Screen DCN empuja W hacia verdad (menos control)
  if (au.screen === "DCN") W += 0.05;
  // Juramento disciplina baja W, soltar la sube, ansiedad la vuelve más oscilante
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  W = Math.max(0, Math.min(1, W));

  return { d, tone, sense: au.sense, W };
}

/** =========================================================
 *  ARPI CERT — sin exponer datos
 *  - seed: <2 turnos
 *  - ok: estable (sin N1/N0 recientes)
 *  - unstable: N1 reciente
 *  - blocked: N0 reciente
 * ========================================================= */
function arpiCert(prevSession, nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const hasN1 = last5.some((x) => x?.N === "N1");

  if (turns < 2) return { level: "seed" };
  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  return { level: "ok" };
}

/** ---------- SESSION ---------- */
function nextSession(prev, au, signals, anti) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
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
    ]
  };

  return next;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session, cert: { level: "seed" } });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    // 1) Parse base por texto
    let au = parseAU(input);

    // 2) Coherencia: juramento desplaza matriz
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);

    // 3) Recalcular sense si matriz cambió
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 4) Anti-loop decide (basado en session previa + estado actual)
    const anti = antiLoopDecision(session, au);

    // 5) Anti-loop puede ajustar matriz (sin romper juramento)
    const adjustedMatrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.matrix = adjustedMatrix;
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 6) Signals (d, tone, W) ahora con coherencia real
    const signals = auSignals(au, session, juramento);

    // 7) Session nueva (incluye anti)
    let newSession = nextSession(session, au, signals, anti);

    // 8) ARPI cert desde session
    const cert = arpiCert(session, newSession);

    // 9) Intervención efectiva (anti puede forzar)
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";

    // SILENCE
    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // STRATEGIC QUESTION
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);

      // si anti=break: corta a una sola frase si hay dos
      if (anti === "break") q = q.split("\n")[0];

      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // ANSWER (OpenAI)
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}

RULES:
- No advice
- No reassurance
- One short intervention
- Max 80 words
- Match user language (${lang}) unless user wrote in another language clearly

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
        temperature: 0.35
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: acorta si se alarga
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert
    });
  } catch (e) {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

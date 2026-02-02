import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU v0.5
 *  - Coherencia AU: juramento modula matriz aunque el texto sea parecido
 *  - Señales vivas: d/tone/W se mueven, y el color cambia “con sentido”
 *  - Anti-loop útil: rompe estancamiento, no “hold” constante
 *  - Perfil AU deducido: bias_matrix / bias_d / bias_W / volatility
 *  - Espejo OK/NOK: deriva por secuencia (no por turno suelto)
 *  - Cert ARPI: seed/ok/unstable/blocked sin exponer datos
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function pickLang(req, bodyLang) {
  const h = req.headers.get("accept-language") || "";
  const fromHeader = h.slice(0, 2).toLowerCase();
  const fromBody = (bodyLang || "").slice(0, 2).toLowerCase();
  const lang = fromBody || fromHeader || "en";
  if (["es", "ca", "en"].includes(lang)) return lang;
  return "en";
}

/** ---------- AU PARSER (texto -> estado base) ---------- */
function parseAU(input) {
  const text = String(input || "").toLowerCase().trim();

  const mode = /\b(we|they|nosotros|vosotros|ellos|ellas|nosaltres|vosaltres)\b/.test(text)
    ? "GM"
    : "GC";

  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad|esgotad)/.test(text)
    ? "DCN"
    : "RAV";

  // MATRIX (default continuidad)
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|hay que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }
  // 4321 — disolución / soltar
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }
  // 2143 — inversión / ontología / duda (incluye “qué es…”, “?”)
  else if (
    /(why|doubt|uncertain|confused|por qué|porque|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|ansioso|obses|pánico|panico)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|violencia|hacer daño)/.test(text)) N_level = "N0";

  // degradación suave por micro-bucle (pregunta muy corta repetida)
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

/** ---------- Strategic Questions (multilengua) ---------- */
const SQ = {
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule you could actually keep?",
    groupAssumption: "Which group assumption is carrying the most tension?",
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
    rule: "¿Cuál sería la regla más simple que sí podrías sostener?",
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
    rule: "Quina seria la norma més simple que sí podries sostenir?",
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
 *  COHERENCIA AU: Juramento como operador real
 * ========================================================= */
function normalizeJuramento(j) {
  const s = String(j || "").toLowerCase().trim();
  if (!s) return null;
  if (s === "limites") return "límites";
  return s;
}

function applyJuramento(matrix, juramento, screen) {
  const j = normalizeJuramento(juramento);
  if (!j) return matrix;

  // Lo importante: MISMA frase => lecturas distintas según juramento
  if (j === "disciplina") {
    // Disciplina fuerza estructura / reduce disolución
    if (matrix === "4321") return "3412";
    return "1234";
  }

  if (j === "ansiedad") {
    // Ansiedad lee inversión (hipótesis/amenaza) casi siempre
    return "2143";
  }

  if (j === "límites") {
    // Límites evita 4321 salvo DCN fuerte
    if (screen === "DCN") return "2143";
    if (matrix === "4321") return "3412";
    return matrix;
  }

  if (j === "excesos") {
    // Excesos empuja a disolución cuando hay neutralidad
    if (matrix === "3412") return "4321";
    return matrix;
  }

  if (j === "soltar") {
    // Soltar prioriza disolución
    return "4321";
  }

  return matrix;
}

/** ---------- util: repetición reciente ---------- */
function recentRepeatCount(chain, matrix, window = 6) {
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
 *  Anti-loop (decisiones útiles)
 * ========================================================= */
function antiLoopDecision(prevSession, au) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 6);

  const last6 = chain.slice(-6);
  const n0 = last6.some((x) => x?.N === "N0");
  const n1Count = last6.filter((x) => x?.N === "N1").length;

  if (n0) return "silence";
  if (n1Count >= 2) return "silence";

  // 3 repeticiones => romper bucle de verdad
  if (rep >= 3) return "break";

  // estancamiento: d casi igual 3 turnos
  if (chain.length >= 3) {
    const a = chain[chain.length - 1]?.d;
    const b = chain[chain.length - 2]?.d;
    const c = chain[chain.length - 3]?.d;
    if (typeof a === "number" && typeof b === "number" && typeof c === "number") {
      if (Math.abs(a - c) < 0.06) return "tilt";
    }
  }

  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "break") {
    // Rotación controlada (no destruye juramento ansiedad)
    if (matrix === "3412") return "2143";
    if (matrix === "2143") return normalizeJuramento(juramento) === "ansiedad" ? "2143" : "1234";
    if (matrix === "1234") return "3412";
    if (matrix === "4321") return "3412";
  }

  if (anti === "tilt") {
    // Pequeño “desplazamiento” para salir del centro
    if (matrix === "3412") return "1234";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return "3412";
    return matrix;
  }

  return matrix;
}

/** =========================================================
 *  Señales AU (d/tone/W) vivas
 * ========================================================= */
function auSignals(au, prevSession, juramento) {
  // Base por matriz
  let d =
    au.matrix === "1234" ? 0.18 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.82 :
    0.45;

  if (au.screen === "DCN") d += 0.10;

  const j = normalizeJuramento(juramento);
  if (j === "disciplina") d -= 0.08;
  if (j === "ansiedad") d += 0.08;
  if (j === "excesos") d += 0.10;
  if (j === "soltar") d += 0.14;
  if (j === "límites") d -= 0.04;

  // Repetición reciente sube tensión si no hay cambio
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 6);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.08;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W (barra) NO igual a d
  let W =
    au.matrix === "1234" ? 0.28 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.80 :
    0.50;

  if (au.screen === "DCN") W += 0.06;
  if (j === "disciplina") W -= 0.06;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.03;

  W = clamp01(W);

  return { d, tone, sense: au.sense, W };
}

/** =========================================================
 *  Perfil AU del usuario (deducido)
 * ========================================================= */
function computeProfile(session) {
  const chain = Array.isArray(session?.chain) ? session.chain : [];
  if (chain.length < 2) {
    return {
      bias_matrix: "3412",
      bias_d: 0.50,
      bias_W: 0.50,
      volatility: 0.25,
      mirror_alignment: 0
    };
  }

  // bias_matrix = la matriz más frecuente en los últimos 12
  const last = chain.slice(-12);
  const freq = { "1234": 0, "2143": 0, "3412": 0, "4321": 0 };
  for (const x of last) {
    if (freq[x.matrix] !== undefined) freq[x.matrix] += 1;
  }
  let bias_matrix = "3412";
  let best = -1;
  for (const k of Object.keys(freq)) {
    if (freq[k] > best) { best = freq[k]; bias_matrix = k; }
  }

  // medias d y W
  const ds = last.map(x => x.d).filter(n => typeof n === "number");
  const ws = last.map(x => x.W).filter(n => typeof n === "number");
  const avg = (arr) => arr.reduce((a,b)=>a+b,0) / Math.max(1, arr.length);

  const bias_d = clamp01(avg(ds) || 0.5);
  const bias_W = clamp01(avg(ws) || 0.5);

  // volatility = cuánto se mueve d (promedio delta)
  let deltas = [];
  for (let i = 1; i < ds.length; i++) deltas.push(Math.abs(ds[i] - ds[i-1]));
  const volatility = clamp01((avg(deltas) || 0.1) * 3); // escalar a 0..1

  // mirror_alignment inicial (se recalcula luego)
  return {
    bias_matrix,
    bias_d,
    bias_W,
    volatility,
    mirror_alignment: 0
  };
}

/** =========================================================
 *  Espejo OK/NOK (secuencia)
 *  - Arranca neutro (0)
 *  - Sube si: hay integración (cambia matriz tras break) o d vuelve hacia 0.5
 *  - Baja si: repetición rígida, o d se aleja de 0.5 de forma sostenida
 * ========================================================= */
function computeMirrorAlignment(prevSession, nextSessionObj) {
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  if (chain.length < 3) return 0;

  const last = chain[chain.length - 1];
  const prev = chain[chain.length - 2];
  const prev2 = chain[chain.length - 3];

  // criterio 1: acercamiento a 0.5
  const dist = (x) => Math.abs((x?.d ?? 0.5) - 0.5);
  const trend = dist(prev2) - dist(last); // positivo => mejor (más cerca)
  let score = 0;
  if (trend > 0.03) score += 0.25;
  if (trend < -0.03) score -= 0.20;

  // criterio 2: diversidad controlada
  const matrices = chain.slice(-6).map(x => x.matrix);
  const uniq = new Set(matrices).size;
  if (uniq >= 3) score += 0.15;
  if (uniq <= 1) score -= 0.25;

  // criterio 3: break útil (anti)
  if (prev?.anti === "break" && last.matrix !== prev.matrix) score += 0.20;

  // criterio 4: N1/N0 penaliza espejo
  const last6 = chain.slice(-6);
  if (last6.some(x => x.N === "N0")) score -= 0.80;
  if (last6.filter(x => x.N === "N1").length >= 2) score -= 0.35;

  // acumulación suave (memoria)
  const prevMirror = typeof prevSession?.mirror === "number" ? prevSession.mirror : 0;
  let nextMirror = clamp01((prevMirror + score + 1) / 2) * 2 - 1; // mantener -1..1 suavemente

  // clamp -1..1
  nextMirror = Math.max(-1, Math.min(1, nextMirror));
  return nextMirror;
}

function mirrorStatus(m) {
  if (m >= 0.35) return "ok";
  if (m <= -0.45) return "nok";
  return "seed"; // neutro/semilla
}

/** =========================================================
 *  ARPI cert (sin datos)
 * ========================================================= */
function arpiCert(nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last6 = chain.slice(-6);

  if (turns < 2) return { level: "seed" };
  if (last6.some(x => x?.N === "N0")) return { level: "blocked" };
  if (last6.filter(x => x?.N === "N1").length >= 2) return { level: "unstable" };

  const m = typeof nextSessionObj?.mirror === "number" ? nextSessionObj.mirror : 0;
  if (m <= -0.45) return { level: "unstable" };
  if (m >= 0.20) return { level: "ok" };
  return { level: "seed" };
}

/** ---------- Session (meta) ---------- */
function nextSession(prev, au, signals, anti) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 2,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    mirror: typeof base.mirror === "number" ? base.mirror : 0,
    profile: base.profile || null,
    last: { ...au, signals, anti },
    chain: [
      ...chain.slice(-29),
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
}

/** =========================================================
 *  Lens textual por juramento (para que se note en contenido)
 * ========================================================= */
function juramentoLensText(juramento, lang) {
  const j = normalizeJuramento(juramento);
  const L = lang;

  const map = {
    disciplina: {
      es: "LENTE: disciplina (estructura mínima, regla concreta, ejecución sin adornos).",
      ca: "LENT: disciplina (estructura mínima, norma concreta, execució sense adorns).",
      en: "LENS: discipline (minimal structure, concrete rule, execution without ornament)."
    },
    ansiedad: {
      es: "LENTE: ansiedad (reduce el ruido, detecta supuesto dominante, devuelve una sola ancla).",
      ca: "LENT: ansietat (redueix el soroll, detecta el supòsit dominant, torna una sola àncora).",
      en: "LENS: anxiety (reduce noise, detect the dominant assumption, return a single anchor)."
    },
    límites: {
      es: "LENTE: límites (marca borde, decide sí/no, elimina ambigüedad).",
      ca: "LENT: límits (marca frontera, decideix sí/no, elimina ambigüitat).",
      en: "LENS: boundaries (draw the edge, decide yes/no, remove ambiguity)."
    },
    excesos: {
      es: "LENTE: excesos (corta el exceso, señala el combustible, aplica freno).",
      ca: "LENT: excessos (talla l’excés, assenyala el combustible, aplica fre).",
      en: "LENS: excess (cut the excess, name the fuel, apply the brake)."
    },
    soltar: {
      es: "LENTE: soltar (renuncia explícita, pérdida asumida, cierre limpio).",
      ca: "LENT: deixar anar (renúncia explícita, pèrdua assumida, tancament net).",
      en: "LENS: release (explicit letting-go, accepted loss, clean closure)."
    }
  };

  if (!j || !map[j]) return "";
  return map[j][L] || map[j].en;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();

    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;
    const lang = pickLang(req, body?.lang);

    // Mostrar indicadores aunque sea SEMILLA: devolvemos AU base si input vacío
    if (!input || String(input).trim().length < 3) {
      const baseSession = session && session.last ? session : {
        v: 2,
        turns: 0,
        silenceCount: 0,
        answerCount: 0,
        mirror: 0,
        profile: null,
        last: null,
        chain: []
      };

      return NextResponse.json({
        output: null,
        au: baseSession.last ? {
          mode: "GC",
          screen: "RAV",
          matrix: baseSession.last?.matrix || "3412",
          sense: baseSession.last?.sense || "direct",
          intervention: "Answer",
          N_level: baseSession.last?.N || "N3",
          signals: {
            d: baseSession.last?.d ?? 0.5,
            W: baseSession.last?.W ?? 0.5,
            tone: "amber",
            sense: baseSession.last?.sense || "direct"
          }
        } : null,
        session: baseSession,
        cert: { level: "seed" }
      });
    }

    // 1) Parse base por texto
    let au = parseAU(input);

    // 2) Coherencia juramento
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 3) anti-loop decide
    const anti = antiLoopDecision(session, au);

    // 4) anti-loop ajusta matriz
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) señales vivas
    const signals = auSignals(au, session, juramento);

    // 6) session nueva (incluye anti)
    let newSession = nextSession(session, au, signals, anti);

    // 7) perfil AU deducido
    const prof = computeProfile(newSession);
    newSession.profile = prof;

    // 8) espejo OK/NOK deriva por secuencia (arranca en medio)
    const mirror = computeMirrorAlignment(session, newSession);
    newSession.mirror = mirror;
    newSession.profile.mirror_alignment = mirror;

    // 9) ARPI cert
    const cert = arpiCert(newSession);

    // SILENCE (seguridad)
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";
    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror: { score: mirror, status: mirrorStatus(mirror) },
        profile: newSession.profile
      });
    }

    // STRATEGIC QUESTION (local)
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);
      if (anti === "break") q = q.split("\n")[0]; // compacto
      newSession.answerCount += 1;
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror: { score: mirror, status: mirrorStatus(mirror) },
        profile: newSession.profile
      });
    }

    // ANSWER (OpenAI)
    const lens = juramentoLensText(juramento, lang);

    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${normalizeJuramento(juramento) || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
MIRROR_SCORE: ${mirror.toFixed(2)}
${lens ? "\n" + lens : ""}

RULES:
- No advice. No “you should”.
- No reassurance.
- One short intervention.
- 40–90 words.
- Match the user's language (${lang}) unless user clearly wrote in another language.
- Sound human, not robotic: use natural syntax and cadence, but stay concise.
- If MATRIX is 2143 (inverse): challenge one assumption briefly.
- If MATRIX is 1234 (structure): make one rule or boundary explicit.
- If MATRIX is 3412 (continuity): name the present vector and one stabilizer.
- If MATRIX is 4321 (release): make a clean renunciation/closure sentence.

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
          { role: "system", content: "You are Wancko. AU-aligned. Minimal, precise, human cadence." },
          { role: "user", content: prompt }
        ],
        temperature: 0.55
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror: { score: mirror, status: mirrorStatus(mirror) },
        profile: newSession.profile
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break acorta un poco (si se alarga)
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert,
      mirror: { score: mirror, status: mirrorStatus(mirror) },
      profile: newSession.profile
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null,
      cert: { level: "seed" }
    });
  }
}

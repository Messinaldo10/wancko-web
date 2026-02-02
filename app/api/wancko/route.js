import { NextResponse } from "next/server";

/** =========================================================
 * WANCKO API — AU v0.6 (reintegrado, vivo)
 * - AU manda (intervention y dinámica real)
 * - Juramento modula matriz (coherencia)
 * - Anti-loop controla variación (no "hold" constante)
 * - Gradiente d + tono + W se mueven (visibles)
 * - ARPI cert (seed/ok/unstable/blocked) sin exponer datos
 * - Perfil espejo (mirror) arranca centrado y deriva por secuencia
 * - Soporta "acto 1" histórico (texto opcional) sin perder AU
 * ========================================================= */

/** ---------- helpers ---------- */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function normLang(h) {
  const s = (h || "").toLowerCase();
  if (s.startsWith("es")) return "es";
  if (s.startsWith("ca")) return "ca";
  return "en";
}
function now() {
  return Date.now();
}

/** ---------- AU PARSER v0.4 ---------- */
function parseAU(input) {
  const text = String(input || "").toLowerCase().trim();

  // MODE
  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN (ruptura/continuidad)
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|sin fuerzas|no puedo más)/.test(text)
      ? "DCN"
      : "RAV";

  // MATRIX default
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de|hay que)/.test(text)) {
    matrix = "1234";
  }
  // 2143 — inversión / ontología / duda / pregunta corta
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  }
  // 4321 — disolución / ruptura / soltar
  else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou|renuncio)/.test(text)
  ) {
    matrix = "4321";
  }

  // N LEVEL (riesgo)
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|ataque de p[aá]nico)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|me voy a hacer daño|suicid)/.test(text)) N_level = "N0";

  // degradación suave por patrón de duda repetitiva
  if (/\?$/.test(text) && text.length < 42 && N_level === "N3") N_level = "N2";

  // INTERVENTION base
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

/** ---------- Coherencia AU: Juramento como operador ---------- */
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

/** ---------- repetición reciente ---------- */
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

/** ---------- Anti-loop decision (útil, visible) ---------- */
function antiLoopDecision(prevSession, au) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;
  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  const rep = recentRepeatCount(chain, au.matrix, 5);
  if (rep >= 3) return "break"; // rompe bucle

  // estancamiento de d (si lo tenemos en chain)
  if (last5.length >= 3) {
    const a = last5[last5.length - 1]?.d;
    const b = last5[last5.length - 3]?.d;
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.06) {
      return "invert";
    }
  }

  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return juramento && String(juramento).toLowerCase().trim() === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "invert") {
    if (matrix === "3412") return "2143";
    if (matrix === "2143") return "3412";
    return matrix;
  }

  return matrix;
}

/** ---------- Signals: d, tone, W (se mueven de verdad) ---------- */
function auSignals(au, prevSession, juramento) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);

  let d =
    au.matrix === "1234" ? 0.18 :
    au.matrix === "3412" ? 0.42 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.84 :
    0.42;

  if (au.screen === "DCN") d += 0.10;

  const j = juramento ? String(juramento).toLowerCase().trim() : "";
  if (j === "disciplina") d -= 0.08;
  if (j === "límites" || j === "limites") d -= 0.03;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;

  // repetición: si repites 2143/3412 sube tensión; si repites 1234 baja; si repites 4321 sube
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.07;
  if (rep >= 2 && au.matrix === "1234") d -= 0.04;
  if (rep >= 2 && au.matrix === "4321") d += 0.04;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.70) tone = "red";

  let W =
    au.matrix === "1234" ? 0.26 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.82 :
    0.50;

  if (au.screen === "DCN") W += 0.06;
  if (j === "disciplina") W -= 0.06;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  // W también reacciona a repetición
  if (rep >= 3) W += 0.05;

  W = clamp01(W);

  return { d, tone, sense: au.sense, W };
}

/** ---------- ARPI cert ---------- */
function arpiCert(nextSessionObj) {
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

/** ---------- Mirror (perfil espejo) ---------- */
function initMirror(prev) {
  const m = prev && typeof prev === "object" ? prev : {};
  const score = typeof m.score === "number" ? clamp01(m.score) : 0.5; // inicia intermedio
  const drift = typeof m.drift === "number" ? clamp01(m.drift) : 0.5;
  const status = typeof m.status === "string" ? m.status : "seed";
  return { score, drift, status };
}

function updateMirror(prevMirror, au, signals, anti) {
  const m = initMirror(prevMirror);

  // idea: OK intermedio (0.5). Deriva según secuencia:
  // - variedad (cambios útiles) → vuelve al centro
  // - bucle/anti-break → se va a extremos (NOK)
  // - d extremo sostenido → se va a extremos
  // - N1/N0 → NOK fuerte
  let score = m.score;

  // N riesgo
  if (au.N_level === "N0") score = 0.95;
  else if (au.N_level === "N1") score = Math.min(0.85, score + 0.18);

  // anti-loop empuja: si rompe bucle, indica tensión => se aleja un poco (porque hay fricción)
  if (anti === "break") score = clamp01(score + 0.07);
  if (anti === "invert") score = clamp01(score + 0.04);

  // d extremo empuja
  if (signals.d >= 0.82) score = clamp01(score + 0.06);
  if (signals.d <= 0.18) score = clamp01(score + 0.04);

  // si no hay tensión (d cerca de centro) atrae al medio
  const pull = 0.06;
  const towardCenter = 0.5 - score;
  score = clamp01(score + towardCenter * pull);

  // status visible
  let status = "ok";
  const dist = Math.abs(score - 0.5);
  if (dist < 0.18) status = "ok";
  else if (dist < 0.28) status = "unstable";
  else status = "nok";

  return { score, drift: m.drift, status };
}

/** ---------- Session ---------- */
function nextSession(prev, au, signals, anti, juramento, mirror) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    juramento: juramento || base.juramento || null,
    mirror,
    last: { ...au, signals, anti },
    chain: [
      ...chain.slice(-29),
      {
        t: now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        screen: au.screen,
        mode: au.mode,
        intent: au.intervention,
        anti: anti || null
      }
    ]
  };
}

/** ---------- Intervención conversacional efectiva ---------- */
function effectiveIntervention(au, anti, prevSession) {
  if (anti === "silence") return "Silence";
  if (au.intervention === "Silence") return "Silence";

  // disolver texto cuando estás en 4321 + DCN y repites → experiencia “se apaga”
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep4321 = recentRepeatCount(chain, "4321", 5);
  if (au.matrix === "4321" && au.screen === "DCN" && rep4321 >= 2) return "Dissolve";

  return au.intervention; // Answer o StrategicQuestion
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
      // devolvemos seed estable para que el front tenga algo que pintar si quiere
      const seedAu = { mode: "GC", screen: "RAV", matrix: "3412", sense: "direct", intervention: "Answer", N_level: "N3" };
      const seedSignals = { d: 0.5, tone: "amber", sense: "direct", W: 0.5 };
      const seedMirror = { score: 0.5, drift: 0.5, status: "seed" };
      return NextResponse.json({
        output: null,
        au: { ...seedAu, signals: seedSignals, anti: null },
        session,
        cert: { level: "seed" },
        mirror: seedMirror
      });
    }

    const lang = normLang(req.headers.get("accept-language"));

    // 1) Parse AU base
    let au = parseAU(input);

    // 2) Coherencia: juramento modula matriz
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 3) Anti-loop decide
    const anti = antiLoopDecision(session, au);

    // 4) Anti-loop ajusta matriz si procede
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) Signals actuales (vivos)
    const signals = auSignals(au, session, juramento);

    // 6) Mirror (arranca centrado y deriva)
    const mirror = updateMirror(session?.mirror, au, signals, anti);

    // 7) Intervención efectiva (ANTES de log)
    const eff = effectiveIntervention(au, anti, session);

    // 8) Session nueva (incluye mirror)
    let newSession = nextSession(session, au, signals, anti, juramento, mirror);

    // 9) ARPI cert desde session
    const cert = arpiCert(newSession);

    // 10) SILENCE / DISSOLVE (conversacional real)
    if (eff === "Silence") {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    if (eff === "Dissolve") {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "", // vacío = “no aparece”
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    // 11) StrategicQuestion (LOCAL)
    if (eff === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);
      // anti-break acorta si se repite demasiado
      if (anti === "break") q = q.split("?")[0] + "?";

      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    // 12) ANSWER (OpenAI)
    const prompt =
`MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
MIRROR_SCORE: ${mirror.score.toFixed(2)} (0.50 is OK center)
ANTI: ${anti || "none"}

RULES:
- No advice. No reassurance. No therapy.
- One short intervention. Closed (no “tell me more”).
- Max 85 words.
- Match user language (${lang}) unless user wrote clearly in another language.
- Sound human, not like a machine: concise, specific, present.

ACTO 1 (H-WANCKO), if present:
${historical ? historical : "(none)"}

USER:
${input}

TASK:
Produce a single, closed intervention aligned with the AU fields above.
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
          { role: "system", content: "You are Wancko’s language engine. Minimal, precise, human. You obey the RULES strictly." },
          { role: "user", content: prompt }
        ],
        temperature: 0.42
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert,
        mirror
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: acorta
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert,
      mirror
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null,
      cert: { level: "seed" },
      mirror: { score: 0.5, drift: 0.5, status: "seed" }
    });
  }
}

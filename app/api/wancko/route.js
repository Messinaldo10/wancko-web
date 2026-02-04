import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU v0.6 (memoria implícita + idioma fijo + overlays)
 *  - Memoria implícita (sin "Recuerda:") con KV + conflictos (choice)
 *  - Lock de idioma por sesión
 *  - StrategicQuestion NO reemplaza: añade overlay
 *  - Anti-loop con acciones útiles (none/break/ground/invert/pause/shorten)
 *  - ARPI cert coherente (seed/ok/unstable/blocked) + hint opcional
 * ========================================================= */

/** ---------- helpers ---------- */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function now() {
  return Date.now();
}

function norm(str) {
  return String(str || "").trim();
}

function normLower(str) {
  return norm(str).toLowerCase();
}

function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}

function array(x) {
  return Array.isArray(x) ? x : [];
}

/** ---------- language lock ---------- */
function detectLang(text) {
  const t = normLower(text);
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(per què|què|això|avui|m'ho)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|por qué|recuerda|olvida|hoy|voy|montaña|playa)\b/.test(t)) return "es";
  return "en";
}

function getLangLock(prevSession, req, input) {
  const s = safeObj(prevSession);
  const explicit = normLower(input);

  // user explicit request
  if (/(responde en catal[aà]n|en catal[aà]n)/.test(explicit)) return "ca";
  if (/(responde en espa[nñ]ol|en espa[nñ]ol|en castellano)/.test(explicit)) return "es";
  if (/(answer in english|in english|respond in english)/.test(explicit)) return "en";

  if (s.lang_lock) return s.lang_lock;

  // initial lock: use accept-language if present, else detect
  const header = req.headers.get("accept-language")?.slice(0, 2);
  const h = header === "es" || header === "ca" || header === "en" ? header : null;
  return h || detectLang(input);
}

/** ---------- AU PARSER v0.3.1 (tu base) ---------- */
function parseAU(input) {
  const text = normLower(input);

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  } else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") {
    N_level = "N2";
  }

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- Strategic Questions (overlay, no reemplazo) ---------- */
const SQ = {
  en: {
    // question
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule that everyone could actually follow?",
    groupAssumption: "Which assumption in the group is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
    step: "What is the next concrete step that costs the least and proves direction?",
    belief: "What belief are you protecting that might be the cause?",
    trust: "What would you stop doing if you trusted your direction?",
    decision: "What’s the real decision you are avoiding naming?",
    // echo (non-interrogative)
    e_release: "Name what you are releasing—one thing.",
    e_invert: "Hold the opposite for one minute and watch what changes.",
    e_stop: "Stop feeding the smallest loop today.",
    e_rule: "One rule. Followable by everyone.",
    e_groupAssumption: "One group assumption is carrying the tension.",
    e_collective: "Make the collective goal clearer than the individual one.",
    e_step: "One small step that proves direction.",
    e_belief: "One protected belief may be the cause.",
    e_trust: "Act as if you trusted your direction.",
    e_decision: "Name the decision you are not naming."
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
    decision: "¿Qué decisión real estás evitando nombrar?",
    e_release: "Nombra lo que estás soltando—una sola cosa.",
    e_invert: "Sostén lo contrario un minuto y mira qué cambia.",
    e_stop: "Deja de alimentar el bucle más pequeño hoy.",
    e_rule: "Una regla. Que todos puedan cumplir.",
    e_groupAssumption: "Hay una suposición del grupo cargando la tensión.",
    e_collective: "Aclara el objetivo colectivo por encima del individual.",
    e_step: "Un paso pequeño que pruebe dirección.",
    e_belief: "Una creencia protegida podría ser la causa.",
    e_trust: "Actúa como si confiaras en tu dirección.",
    e_decision: "Nombra la decisión que no estás nombrando."
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
    decision: "Quina decisió real estàs evitant anomenar?",
    e_release: "Anomena el que estàs deixant anar—una sola cosa.",
    e_invert: "Sostén el contrari un minut i mira què canvia.",
    e_stop: "Deixa d’alimentar el bucle més petit avui.",
    e_rule: "Una norma. Que tothom pugui seguir.",
    e_groupAssumption: "Hi ha una suposició del grup carregant la tensió.",
    e_collective: "Fes més clar l’objectiu col·lectiu que l’individual.",
    e_step: "Un pas petit que provi direcció.",
    e_belief: "Una creença protegida podria ser la causa.",
    e_trust: "Actua com si confiessis en la teva direcció.",
    e_decision: "Anomena la decisió que no estàs anomenant."
  }
};

function pickSQKey(au) {
  const { mode, screen, matrix } = au;

  if (screen === "DCN") {
    if (matrix === "4321") return "release";
    if (matrix === "2143") return "invert";
    return "stop";
  }
  if (mode === "GM") {
    if (matrix === "1234") return "rule";
    if (matrix === "2143") return "groupAssumption";
    return "collective";
  }
  if (matrix === "1234") return "step";
  if (matrix === "2143") return "belief";
  if (matrix === "4321") return "trust";
  return "decision";
}

function strategicOverlay(au, lang, userAskedQuestion) {
  const L = SQ[lang] ? lang : "en";
  const key = pickSQKey(au);
  const echoKey = `e_${key}`;
  return userAskedQuestion ? SQ[L][key] : SQ[L][echoKey];
}

/** =========================================================
 *  COHERENCIA AU — Juramento como operador (núcleo)
 * ========================================================= */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = normLower(juramento);

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

/** ---------- memory: KV + conflicts + entities ---------- */
function ensureMemory(prevSession) {
  const s = safeObj(prevSession);
  const kv = safeObj(s.kv);
  const state = safeObj(s.state);
  const entities = safeObj(state.entities);
  const conflicts = array(state.conflicts);

  return {
    ...s,
    kv,
    state: {
      ...state,
      entities,
      conflicts
    }
  };
}

function upsertKV(kv, key, value, scoreBoost = 0.18) {
  const k = normLower(key).replace(/\s+/g, "_");
  if (!k) return kv;
  const v = norm(value);
  if (!v) return kv;

  const prev = kv[k];
  const baseScore = prev?.score ?? 0.45;
  const nextScore = clamp01(baseScore + scoreBoost);

  return {
    ...kv,
    [k]: { value: v, score: nextScore, last: now() }
  };
}

function extractImplicitMemory(input, lang, mem) {
  const text = normLower(input);
  let kv = mem.kv;
  let entities = mem.state.entities;
  let conflicts = mem.state.conflicts;

  // explicit "Recuerda:" (still supported)
  const remember = text.match(/^(recuerda|remember)\s*:\s*(.+)$/i);
  if (remember) {
    const payload = remember[2] || "";
    // forms: "animal = cabra" or "la ciudad es Barcelona"
    const m1 = payload.match(/^\s*([a-záéíóúñç·l_ ]+)\s*=\s*(.+)\s*$/i);
    if (m1) {
      kv = upsertKV(kv, m1[1], m1[2], 0.35);
      return { kv, entities, conflicts, touched: true };
    }
    const m2 = payload.match(/^\s*(el|la)?\s*([a-záéíóúñç·l_ ]+)\s+es\s+(.+)\s*$/i);
    if (m2) {
      kv = upsertKV(kv, m2[2], m2[3], 0.35);
      return { kv, entities, conflicts, touched: true };
    }
  }

  // "el animal es X" / "la ciudad es X"
  const def = text.match(/\b(el|la)\s+([a-záéíóúñç·l_ ]{3,30})\s+(es|era)\s+([a-z0-9áéíóúñç·l' -]{2,60})/i);
  if (def) {
    const key = def[2];
    const val = def[4];
    kv = upsertKV(kv, key, val, 0.22);
  }

  // "voy a ir a X" (plans) -> entity + recent topic
  const go1 = text.match(/\b(voy a ir a|ir[eé]\s+a|me voy a|iré a|i will go to|i'm going to)\s+([a-z0-9áéíóúñç·l' -]{2,60})/i);
  if (go1) {
    const place = norm(go1[2]);
    const id = normLower(place);
    entities = { ...entities, [id]: { kind: "place", label: place, last: now() } };
    kv = upsertKV(kv, "plan", place, 0.10);
  }

  // "entre A y B" or "between A and B" -> conflict choice
  const betweenES = text.match(/\b(entre)\s+(.+?)\s+(y|o)\s+(.+?)(\?|\.|$)/i);
  const betweenEN = text.match(/\b(between)\s+(.+?)\s+(and|or)\s+(.+?)(\?|\.|$)/i);
  const b = betweenES || betweenEN;
  if (b) {
    const a = norm(b[2]).slice(0, 60);
    const c = norm(b[4]).slice(0, 60);
    if (a && c) {
      conflicts = [
        ...conflicts.slice(-19),
        { type: "choice", a, b: c, last: now(), score: 0.62 }
      ];
    }
  }

  // "playa" / "montaña" implicit choice capture (your example)
  if ((/\bplaya\b/.test(text) && /\bmonta(ñ|n)a\b/.test(text)) || /\b(beach)\b/.test(text) && /\b(mountain)\b/.test(text)) {
    conflicts = [
      ...conflicts.slice(-19),
      {
        type: "choice",
        a: /\bplaya\b/.test(text) ? "playa" : "beach",
        b: /\bmonta(ñ|n)a\b/.test(text) ? "montaña" : "mountain",
        last: now(),
        score: 0.72
      }
    ];
  }

  return { kv, entities, conflicts, touched: true };
}

function detectRecallIntent(input) {
  const t = normLower(input);
  // general
  if (/(qué dije|que dije|what did i say|recuerdas lo que dije)/.test(t)) return { type: "chat" };

  // animal/city
  if (/(qué animal|que animal|what animal)/.test(t)) return { type: "kv", key: "animal" };
  if (/(qué ciudad|que ciudad|what city|which city)/.test(t)) return { type: "kv", key: "ciudad" };

  // choice
  if (/(entre qu[eé] dos opciones|entre quines dues opcions|between which two options|which two options)/.test(t)) {
    return { type: "choice" };
  }

  // list saved
  if (/(dime.*(animal|ciudad).*(guardad|guardado|saved)|animal y la ciudad)/.test(t)) return { type: "kv_list" };

  return null;
}

function answerRecall(session, lang, intent) {
  const s = ensureMemory(session);
  const kv = s.kv;
  const conflicts = s.state.conflicts;

  const L = lang || "en";

  if (intent.type === "kv") {
    // normalize key names (spanish)
    const k = intent.key;
    const candidates = [
      k,
      k === "ciudad" ? "la_ciudad" : k,
      k === "animal" ? "el_animal" : k,
      k === "ciudad" ? "city" : k,
      k === "animal" ? "animal" : k
    ].map((x) => normLower(x).replace(/\s+/g, "_"));

    let best = null;
    for (const c of candidates) {
      if (kv[c]?.value) {
        best = kv[c].value;
        break;
      }
    }

    if (!best) {
      if (L === "es") return "No tengo ese dato guardado en este chat.";
      if (L === "ca") return "No tinc aquesta dada guardada en aquest xat.";
      return "I don’t have that saved in this chat.";
    }

    if (L === "es") return `Dijiste: ${best}.`;
    if (L === "ca") return `Vas dir: ${best}.`;
    return `You said: ${best}.`;
  }

  if (intent.type === "choice") {
    const last = conflicts.slice(-1)[0];
    if (!last || last.type !== "choice") {
      if (L === "es") return "No tengo registrada una disyuntiva clara en este chat.";
      if (L === "ca") return "No tinc registrada cap disjuntiva clara en aquest xat.";
      return "I don’t have a clear choice recorded in this chat.";
    }
    if (L === "es") return `Te debates entre: ${last.a} y ${last.b}.`;
    if (L === "ca") return `Et debates entre: ${last.a} i ${last.b}.`;
    return `You’re choosing between: ${last.a} and ${last.b}.`;
  }

  if (intent.type === "kv_list") {
    const animal = kv["animal"]?.value || kv["el_animal"]?.value || kv["animal_guardado"]?.value;
    const ciudad = kv["ciudad"]?.value || kv["la_ciudad"]?.value || kv["city"]?.value;
    if (lang === "es") return `El animal guardado es "${animal || "—"}" y la ciudad es "${ciudad || "—"}".`;
    if (lang === "ca") return `L’animal guardat és "${animal || "—"}" i la ciutat és "${ciudad || "—"}".`;
    return `Saved animal: "${animal || "—"}", city: "${ciudad || "—"}".`;
  }

  // chat recall: we keep it minimal to avoid storing full transcript server-side
  if (intent.type === "chat") {
    const last = array(s.chain).slice(-1)[0];
    if (lang === "es") return last ? "Estoy siguiendo el hilo de este chat." : "Aún no hay suficiente contexto en este chat.";
    if (lang === "ca") return last ? "Segueixo el fil d’aquest xat." : "Encara no hi ha prou context en aquest xat.";
    return last ? "I’m tracking this chat’s thread." : "Not enough context in this chat yet.";
  }

  return null;
}

/** ---------- repeats & anti-loop ---------- */
function recentRepeatCount(chain, matrix, window = 4) {
  const c = array(chain);
  if (!c.length) return 0;
  const slice = c.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

function antiLoopDecision(prevSession, currentAu) {
  const chain = array(prevSession?.chain);
  const rep = recentRepeatCount(chain, currentAu.matrix, 4);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;
  if (hasN0) return { action: "pause", reason: "n0_cluster" };
  if (n1Count >= 2) return { action: "pause", reason: "n1_cluster" };

  if (rep >= 3) return { action: "break", reason: "repeat_matrix" };

  // stagnation of d (if we have it)
  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && currentAu.matrix === "2143" && rep >= 2) {
    return { action: "ground", reason: "repeat_inversion" };
  }

  return { action: "none", reason: null };
}

function applyAntiToMatrix(matrix, antiAction, juramento) {
  if (!antiAction || antiAction === "none") return matrix;

  if (antiAction === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return normLower(juramento) === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }
  if (antiAction === "ground") return "3412";

  return matrix;
}

/** ---------- signals (d/tone/W) ---------- */
function auSignals(au, prevSession, juramento) {
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.80 :
    0.45;

  if (au.screen === "DCN") d += 0.08;

  const j = juramento ? normLower(juramento) : "";
  if (j === "disciplina") d -= 0.06;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;
  if (j === "límites" || j === "limites") d -= 0.02;

  const chain = array(prevSession?.chain);
  const rep = recentRepeatCount(chain, au.matrix, 4);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.06;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.62 :
    au.matrix === "4321" ? 0.78 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  W = clamp01(W);

  // ok_live: simple coherence proxy (can be improved later)
  // higher when stable + not in N1/N0
  let ok = 0.5;
  if (au.N_level === "N3") ok += 0.12;
  if (au.N_level === "N2") ok += 0.04;
  if (au.N_level === "N1") ok -= 0.18;
  if (au.N_level === "N0") ok -= 0.30;
  ok -= Math.abs(d - 0.45) * 0.12; // avoid extremes unless earned
  ok = clamp01(ok);

  return { d, tone, sense: au.sense, W, ok };
}

/** ---------- ARPI cert ---------- */
function arpiCert(nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = array(nextSessionObj?.chain);
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const hasN1 = last5.some((x) => x?.N === "N1");

  if (turns < 2) return { level: "seed" };
  if (hasN0) return { level: "blocked", hint: "pausa requerida" };
  if (hasN1) return { level: "unstable", hint: "tensión reciente" };
  return { level: "ok" };
}

/** ---------- session update ---------- */
function nextSession(prev, au, signals, juramento, anti) {
  const base = ensureMemory(prev);
  const chain = array(base.chain);

  const next = {
    v: 2,
    lang_lock: base.lang_lock || null,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,

    // memory
    kv: base.kv,
    state: base.state,

    // last AU snapshot
    last: { ...au, signals, anti },

    // chain (debug)
    chain: [
      ...chain.slice(-29),
      {
        t: now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        ok: signals.ok,
        intent: au.intervention,
        anti: anti?.action || "none"
      }
    ]
  };

  // cycle helper (for UI even before first au)
  next.cycle = {
    band: Math.max(1, Math.min(4, 1 + (au.matrix === "1234" ? 0 : au.matrix === "3412" ? 1 : au.matrix === "2143" ? 2 : 3))),
    ok_live: signals.ok
  };

  // persist juramento as profile marker (optional)
  if (juramento) next.juramento = juramento;

  return next;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = norm(body?.input);
    const sessionIn = body?.session || null;
    const juramento = body?.juramento || null;

    // build memory-safe session object
    let session = ensureMemory(sessionIn);

    // language lock
    const lang = getLangLock(session, req, input);
    session.lang_lock = lang;

    if (!input || input.length < 2) {
      // keep cert seed but allow UI to show neutral cycle
      const seedSession = {
        ...session,
        turns: session.turns || 0,
        cycle: session.cycle || { band: 1, ok_live: 0.5 }
      };
      return NextResponse.json({ output: null, au: null, session: seedSession, cert: { level: "seed" } });
    }

    // 0) implicit memory extraction BEFORE AU decisions (so it influences cert later)
    const memUpd = extractImplicitMemory(input, lang, session);
    session.kv = memUpd.kv;
    session.state.entities = memUpd.entities;
    session.state.conflicts = memUpd.conflicts;

    // 1) parse base
    let au = parseAU(input);

    // 2) juramento operator
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 3) anti-loop decision
    const anti = antiLoopDecision(session, au);

    // 4) anti-loop may adjust matrix (controlled)
    au.matrix = applyAntiToMatrix(au.matrix, anti.action, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) signals
    const signals = auSignals(au, session, juramento);

    // 6) new session
    let newSession = nextSession(session, au, signals, juramento, anti);
    const cert = arpiCert(newSession);

    // 7) recall intent (must override strategic)
    const recall = detectRecallIntent(input);
    if (recall) {
      const recallOut = answerRecall(newSession, lang, recall);
      newSession.answerCount += 1;
      return NextResponse.json({
        output: recallOut || (lang === "es" ? "No tengo ese dato guardado en este chat." : lang === "ca" ? "No tinc aquesta dada guardada en aquest xat." : "I don’t have that saved in this chat."),
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 8) effective silence (security / anti pause)
    const effectiveSilence = au.intervention === "Silence" || anti.action === "pause";
    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 9) strategic overlay (no reemplaza)
    const userAskedQuestion = input.includes("?");
    const overlay = au.intervention === "StrategicQuestion"
      ? strategicOverlay(au, lang, userAskedQuestion)
      : null;

    // 10) LLM answer (Wancko)
    const memoryFacts = (() => {
      const kv = safeObj(newSession.kv);
      const keys = Object.keys(kv).slice(0, 12);
      const items = keys
        .map((k) => `${k}=${kv[k]?.value}`)
        .filter(Boolean)
        .slice(-10);
      const lastChoice = array(newSession.state.conflicts).slice(-1)[0];
      const choiceLine = lastChoice?.type === "choice" ? `choice:${lastChoice.a}|${lastChoice.b}` : "";
      return [items.join("; "), choiceLine].filter(Boolean).join(" · ");
    })();

    const prompt = `
LANG_LOCK: ${lang}
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
OK_LIVE: ${signals.ok.toFixed(2)}
ANTI: ${anti.action || "none"}

MEMORY (this chat only; may be incomplete):
${memoryFacts || "—"}

RULES:
- Keep it human, not robotic.
- Use the memory above when relevant. If not present, don't invent.
- Do not claim long-term memory beyond this chat/session.
- No therapy. No diagnosis. No reassurance.
- Avoid generic filler.
- 1 short response (max 85 words).
- Write in ${lang} unless user clearly used another language.
- If user message is a plan ("I'll go to..."), reflect it and keep continuity.
- If user asked a direct question, answer directly before anything else.

USER:
${input}

TASK:
Write one concise, context-aware intervention.
${overlay ? `Then add a final line labeled "AU:" with: ${overlay}` : ""}
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
          { role: "system", content: "You are Wancko: AU-aligned conversation engine. Keep continuity within this chat." },
          { role: "user", content: prompt }
        ],
        temperature: 0.45
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: overlay ? (lang === "es" ? `—\nAU: ${overlay}` : lang === "ca" ? `—\nAU: ${overlay}` : `—\nAU: ${overlay}`) : "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti: shorten if it rambles
    if (anti.action === "break" && out.length > 220) {
      out = out.split("\n")[0];
      if (out.includes(".")) out = out.split(".")[0] + ".";
    }

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

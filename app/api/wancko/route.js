import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU + CSA Memory v0.1
 *  - Memoria implícita: guarda hechos y entidades sin “Recuerda:”
 *  - Coherencia AU: matriz/N/d/W se modulan por conversación (CSA + sesión)
 *  - Anti-loop: break/ground/invert/silence útiles (no “hold” constante)
 *  - ARPI cert: seed/ok/unstable/blocked sin exponer datos
 * ========================================================= */

/* ---------------- Utils ---------------- */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function norm(s) {
  return String(s || "").trim();
}

function normLower(s) {
  return norm(s).toLowerCase();
}

function safeLangFromHeader(req) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return l === "es" || l === "ca" || l === "en" ? l : "en";
}

function nowTs() {
  return Date.now();
}

/* ---------------- AU PARSER (base) ---------------- */

function parseAU(input) {
  const text = normLower(input);

  // MODE
  const mode = /\b(we|they|nosotros|ellos|nosaltres|ells)\b/.test(text) ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|esgotad|buit)/.test(text) ? "DCN" : "RAV";

  // MATRIX (default continuidad)
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de|he de)/.test(text)) {
    matrix = "1234";
  }
  // 4321 — disolución
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }
  // 2143 — inversión / ontología / duda
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|existencia|existència|existence)/.test(text)
  ) {
    matrix = "2143";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pànic|obsess)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|violència|fer mal)/.test(text)) N_level = "N0";

  // degradación suave por preguntas cortas repetitivas
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") N_level = "N2";

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ---------------- Strategic Questions ---------------- */

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

/* =========================================================
 *  CSA Memory v0.1 — Campo de Significación AU
 *  - Guarda entidades/planes implícitos
 *  - TTL: se olvida si no reaparece
 *  - Prioriza verdad presente (reciente) pero archiva histórico
 * ========================================================= */

function initCSA() {
  return {
    facts: {},      // key -> { value, weight, ttl, lastTurn, source }
    entities: {},   // type -> { value -> { weight, ttl, lastTurn } }
    timeline: [],   // { turn, key, w }
    stats: { turns: 0, drift: 0.18, novelty: 0.25 }
  };
}

function csaTouchEntity(csa, type, value, turn, w = 0.55, ttl = 6) {
  if (!value) return;
  const t = String(type || "misc");
  const v = String(value).trim();
  if (!v) return;

  if (!csa.entities[t]) csa.entities[t] = {};
  const prev = csa.entities[t][v];

  const next = {
    weight: clamp01((prev?.weight ?? 0.0) * 0.55 + w * 0.65),
    ttl: Math.max(prev?.ttl ?? 0, ttl),
    lastTurn: turn
  };
  csa.entities[t][v] = next;

  csa.timeline.push({ turn, key: `${t}:${v}`, w: next.weight });
  csa.timeline = csa.timeline.slice(-48);
}

function csaTouchFact(csa, key, value, turn, w = 0.6, ttl = 6, source = "implicit") {
  if (!key) return;
  const k = String(key).trim();
  const prev = csa.facts[k];

  csa.facts[k] = {
    value,
    weight: clamp01((prev?.weight ?? 0.0) * 0.55 + w * 0.7),
    ttl: Math.max(prev?.ttl ?? 0, ttl),
    lastTurn: turn,
    source: prev?.source || source
  };

  csa.timeline.push({ turn, key: `fact:${k}`, w: csa.facts[k].weight });
  csa.timeline = csa.timeline.slice(-48);
}

function csaDecay(csa) {
  // TTL decay
  for (const k of Object.keys(csa.facts || {})) {
    csa.facts[k].ttl -= 1;
    if (csa.facts[k].ttl <= 0) delete csa.facts[k];
  }
  for (const t of Object.keys(csa.entities || {})) {
    for (const v of Object.keys(csa.entities[t] || {})) {
      csa.entities[t][v].ttl -= 1;
      if (csa.entities[t][v].ttl <= 0) delete csa.entities[t][v];
    }
    if (Object.keys(csa.entities[t] || {}).length === 0) delete csa.entities[t];
  }
}

function csaTopEntity(csa, type) {
  const bucket = csa?.entities?.[type];
  if (!bucket) return null;
  let best = null;
  for (const [v, meta] of Object.entries(bucket)) {
    const score = (meta?.weight ?? 0) + (meta?.ttl ?? 0) * 0.02;
    if (!best || score > best.score) best = { value: v, score, meta };
  }
  return best?.value || null;
}

function extractImplicitMemory(input, lang) {
  const text = normLower(input);

  // Very small bootstrap dictionaries
  const animals = [
    "cabra","gorila","perro","gato","caballo","vaca","oveja","pollo","pato","conejo",
    "goat","gorilla","dog","cat","horse","cow","sheep","chicken","duck","rabbit"
  ];

  // Detect explicit "animal/city" patterns
  const animalMatch =
    text.match(/\b(animal)\b.*?\b(es|=|:\s*)\s*([a-záéíóúñç·lüï]+)\b/) ||
    text.match(/\b(the animal)\b.*?\b(is|=|:\s*)\s*([a-z]+)\b/);

  const cityMatch =
    text.match(/\b(ciudad)\b.*?\b(es|=|:\s*)\s*([a-záéíóúñç·lüï]+)\b/) ||
    text.match(/\b(city)\b.*?\b(is|=|:\s*)\s*([a-z]+)\b/);

  const placeImplicit =
    text.match(/\b(voy a|voy al|voy a la|me voy a|iremos a|iré a|today i'?m going to|i'?m going to)\s+([a-záéíóúñç·lüï]+)\b/);

  // simple “playa” detection as place/plan
  const beach =
    /\b(playa|platja|beach)\b/.test(text) ? (/\b(platja)\b/.test(text) ? "platja" : "playa") : null;

  // Emotion / state
  const mood =
    text.match(/\b(estoy|em sento|me siento|i am|i'm)\s+(content|feliz|triste|ansioso|agotado|cansado|buit|contenta|content)\b/);

  const found = {
    animal: null,
    city: null,
    place: null,
    plan: null,
    mood: null
  };

  if (animalMatch) found.animal = animalMatch[3] || animalMatch[2];
  else {
    // fallback: first mentioned animal token
    for (const a of animals) {
      if (text.includes(` ${a} `) || text.endsWith(` ${a}`) || text.startsWith(`${a} `)) {
        found.animal = a;
        break;
      }
    }
  }

  if (cityMatch) found.city = cityMatch[3] || cityMatch[2];

  if (placeImplicit) found.place = placeImplicit[2] || null;
  if (beach) found.place = beach;

  // plan: going-to + place
  if (placeImplicit || beach) found.plan = found.place ? `go:${found.place}` : "go";

  if (mood) found.mood = mood[2] || mood[1];

  return found;
}

function isMemoryQuestion(input) {
  const t = normLower(input);
  return (
    /\b(qué|que|what)\b.*\b(animal|ciudad|city|place|lugar)\b/.test(t) ||
    /\b(dime|tell me)\b.*\b(animal|ciudad|city|place|lugar)\b/.test(t) ||
    /\b(sabes|do you know)\b.*\b(donde|where)\b/.test(t)
  );
}

function answerFromMemory(input, lang, csa) {
  const t = normLower(input);

  // animal?
  if (/\b(animal)\b/.test(t)) {
    const a = csaTopEntity(csa, "animal");
    if (!a) return lang === "es" ? "No lo tengo registrado aún." : lang === "ca" ? "Encara no ho tinc registrat." : "I don’t have it registered yet.";
    return lang === "es" ? `Dijiste: ${a}.` : lang === "ca" ? `Has dit: ${a}.` : `You said: ${a}.`;
  }

  // city?
  if (/\b(ciudad|city)\b/.test(t)) {
    const c = csaTopEntity(csa, "city");
    if (!c) return lang === "es" ? "No lo tengo registrado aún." : lang === "ca" ? "Encara no ho tinc registrat." : "I don’t have it registered yet.";
    return lang === "es" ? `Dijiste: ${c}.` : lang === "ca" ? `Has dit: ${c}.` : `You said: ${c}.`;
  }

  // place / where going?
  if (/\b(donde|where)\b/.test(t) || /\b(lugar|place)\b/.test(t)) {
    const p = csaTopEntity(csa, "place");
    if (!p) return lang === "es" ? "No tengo un lugar concreto registrado aún." : lang === "ca" ? "Encara no tinc cap lloc concret registrat." : "I don’t have a concrete place registered yet.";
    return lang === "es" ? `Has dicho que vas a: ${p}.` : lang === "ca" ? `Has dit que vas a: ${p}.` : `You said you’re going to: ${p}.`;
  }

  return null;
}

/* =========================================================
 *  COHERENCIA AU — Juramento como operador
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

/* ---------------- Anti-loop ---------------- */

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

function antiLoopDecision(prevSession, currentAu) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, currentAu.matrix, 5);

  const last5 = chain.slice(-5);
  const n0 = last5.some((x) => x?.N === "N0");
  const n1 = last5.filter((x) => x?.N === "N1").length;
  if (n0) return "silence";
  if (n1 >= 2) return "silence";

  if (rep >= 3) return "break";

  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && currentAu.matrix === "2143" && rep >= 2) return "ground";

  // stagnation in d (very small movement)
  if (chain.length >= 3) {
    const a = chain[chain.length - 1]?.d;
    const b = chain[chain.length - 3]?.d;
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
    if (matrix === "2143") return normLower(juramento) === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "ground") return "3412";
  if (anti === "invert") return matrix === "2143" ? "3412" : "2143";

  return matrix;
}

/* ---------------- Signals (d, tone, W) ---------------- */

function auSignals(au, prevSession, juramento, csa) {
  // base d per matriz
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.46 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.82 :
    0.46;

  if (au.screen === "DCN") d += 0.08;

  const j = juramento ? normLower(juramento) : "";
  if (j === "disciplina") d -= 0.06;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;
  if (j === "límites" || j === "limites") d -= 0.02;

  // CSA influence: drift & novelty move d
  const drift = typeof csa?.stats?.drift === "number" ? csa.stats.drift : 0.18;
  const novelty = typeof csa?.stats?.novelty === "number" ? csa.stats.novelty : 0.25;
  d += (drift - 0.18) * 0.35;
  d += (novelty - 0.25) * 0.25;

  // repetition tension
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.06;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W (barra)
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.82 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  // CSA influence on W: drift pushes to "truth side"
  W += (drift - 0.18) * 0.35;
  W = clamp01(W);

  return { d, tone, sense: au.sense, W };
}

/* ---------------- Cycle OK/band (visible in UI) ---------------- */

function updateCycle(prevCycle, au, signals, csa, anti) {
  const base = prevCycle && typeof prevCycle === "object" ? prevCycle : { band: 1, ok_live: 0.5 };

  // ok movement: + when stable & coherent, - when drift/anti/silence
  const drift = typeof csa?.stats?.drift === "number" ? csa.stats.drift : 0.18;
  const novelty = typeof csa?.stats?.novelty === "number" ? csa.stats.novelty : 0.25;

  let ok = typeof base.ok_live === "number" ? base.ok_live : 0.5;

  // stability is good, excess drift penalizes
  ok += (0.22 - drift) * 0.22;
  ok += (0.30 - novelty) * 0.10;

  // anti penalties
  if (anti === "silence") ok -= 0.10;
  if (anti === "break") ok -= 0.04;
  if (anti === "invert") ok -= 0.02;

  // N penalties
  if (au.N_level === "N1") ok -= 0.08;
  if (au.N_level === "N0") ok -= 0.20;

  // gentle pull toward mid at start
  ok = ok * 0.92 + 0.5 * 0.08;
  ok = clamp01(ok);

  // band: 1..4 by d zones (your matrices map)
  const d = signals.d;
  let band = 2;
  if (d < 0.30) band = 1;
  else if (d < 0.60) band = 2;
  else if (d < 0.78) band = 3;
  else band = 4;

  return { band, ok_live: ok };
}

/* ---------------- ARPI cert ---------------- */

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

/* ---------------- Session ---------------- */

function nextSession(prev, au, signals, anti, csa, cycle) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
    v: 2,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals, anti },
    csa,
    cycle,
    chain: [
      ...chain.slice(-29),
      {
        t: nowTs(),
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

/* ---------------- OpenAI (Wancko) ---------------- */

async function wanckoLLM({ input, lang, au, signals, juramento, memoryHints }) {
  const system = "You are Wancko’s language engine. Closed interventions. No therapy. No advice. No reassurance.";
  const prompt = `
AU_MODE: ${au.mode}
AU_SCREEN: ${au.screen}
AU_MATRIX: ${au.matrix}
AU_SENSE: ${au.sense}
AU_N: ${au.N_level}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
JURAMENTO: ${juramento || "none"}

MEMORY_HINTS (use only if relevant, do not invent):
${memoryHints}

RULES:
- No advice
- No reassurance
- No follow-up invitation
- One short intervention
- 35–85 words
- Match language: ${lang}

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
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.45
    })
  });

  if (!res.ok) return "—";
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "—";
}

/* ---------------- API ---------------- */

export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    if (!input || norm(input).length < 2) {
      return NextResponse.json({
        output: null,
        au: null,
        session,
        cert: { level: "seed" }
      });
    }

    const lang = safeLangFromHeader(req);

    // ----- CSA update -----
    const prevCSA = session?.csa && typeof session.csa === "object" ? session.csa : initCSA();
    const turn = (session?.turns || 0) + 1;

    // decay first (so re-mentions re-activate)
    const csa = JSON.parse(JSON.stringify(prevCSA));
    csaDecay(csa);
    csa.stats.turns = turn;

    // extract implicit memory
    const found = extractImplicitMemory(input, lang);

    if (found.animal) csaTouchEntity(csa, "animal", found.animal, turn, 0.82, 12);
    if (found.city) csaTouchEntity(csa, "city", found.city, turn, 0.78, 10);
    if (found.place) csaTouchEntity(csa, "place", found.place, turn, 0.62, 7);
    if (found.plan) csaTouchFact(csa, "plan:last", found.plan, turn, 0.55, 6, "implicit");
    if (found.mood) csaTouchEntity(csa, "mood", found.mood, turn, 0.55, 5);

    // update drift/novelty cheaply (Zipf-lite heuristic)
    // drift rises when many new keys appear
    const recent = Array.isArray(csa.timeline) ? csa.timeline.slice(-10) : [];
    const uniq = new Set(recent.map((x) => x.key));
    const novelty = clamp01(uniq.size / 10);
    const drift = clamp01((novelty * 0.55) + 0.15);
    csa.stats.novelty = novelty;
    csa.stats.drift = drift;

    // ----- AU base parse -----
    let au = parseAU(input);

    // Memory questions should not be derailed into generic strategic questions
    const memQ = isMemoryQuestion(input);
    if (memQ && au.intervention === "StrategicQuestion") au.intervention = "Answer";

    // Juramento coherence
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // Anti-loop decision
    const anti = antiLoopDecision(session, au);

    // Anti can adjust matrix
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // Signals now depend on CSA+session
    const signals = auSignals(au, session, juramento, csa);

    // Cycle
    const cycle = updateCycle(session?.cycle, au, signals, csa, anti);

    // New session
    let newSession = nextSession(session, au, signals, anti, csa, cycle);

    // Cert
    const cert = arpiCert(newSession);

    // Effective silence
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";
    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals: { ...signals, anti }, anti },
        session: newSession,
        cert
      });
    }

    // Memory answer path (fast, coherent)
    if (memQ) {
      const mAns = answerFromMemory(input, lang, csa);
      if (mAns) {
        newSession.answerCount += 1;
        return NextResponse.json({
          output: mAns,
          au: { ...au, signals: { ...signals, anti }, anti },
          session: newSession,
          cert
        });
      }
      // if asked but nothing found => keep AU but answer plainly
      const none = lang === "es"
        ? "No tengo ese dato registrado todavía en esta conversación."
        : lang === "ca"
        ? "Encara no tinc aquesta dada registrada en aquesta conversa."
        : "I don’t have that registered yet in this conversation.";
      newSession.answerCount += 1;
      return NextResponse.json({
        output: none,
        au: { ...au, signals: { ...signals, anti }, anti },
        session: newSession,
        cert
      });
    }

    // Strategic Question
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);
      if (anti === "break") q = q.split("\n")[0];
      newSession.answerCount += 1;
      return NextResponse.json({
        output: q,
        au: { ...au, signals: { ...signals, anti }, anti },
        session: newSession,
        cert
      });
    }

    // LLM Answer
    const memoryHints = [
      `animal=${csaTopEntity(csa, "animal") || "—"}`,
      `city=${csaTopEntity(csa, "city") || "—"}`,
      `place=${csaTopEntity(csa, "place") || "—"}`,
      `mood=${csaTopEntity(csa, "mood") || "—"}`
    ].join("\n");

    let out = await wanckoLLM({ input, lang, au, signals, juramento, memoryHints });

    // anti-break: shorten
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals: { ...signals, anti }, anti },
      session: newSession,
      cert
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

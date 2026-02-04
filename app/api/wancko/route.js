import { NextResponse } from "next/server";

/** =========================================================
 * WANCKO API — AU v0.6 (GLIFOS + MEMORIA + IDIOMA + FONDO)
 * - Memoria por glifos (facts + topics + plans) sin "Recuerda:"
 * - Idioma estable por sesión (soft-lock) evita saltos es↔ca
 * - Matriz depende del texto + juramento + conversación (no fijo)
 * - Anti-loop útil (break/ground/silence/invert) no "hold" constante
 * - Certificados: ARPI (armonía), HAI (acuerdo/valor), Baski (control)
 * - Señales: d (gradiente), tone, W, ok_live, band, complexity, beauty
 * ========================================================= */

/* ---------------- helpers ---------------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const now = () => Date.now();

function safeJson(obj, fallback) {
  try {
    return obj ?? fallback;
  } catch {
    return fallback;
  }
}

function norm(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ");
}

function lc(s) {
  return String(s || "").toLowerCase();
}

/* ---------------- language (stable) ---------------- */
function detectLangStrong(text) {
  const t = lc(text);
  // strong Catalan signals
  const caStrong =
    /[àèéíïòóúüç·l]/.test(t) ||
    /\b(què|per què|això|aquesta|aquest|m'|em|\bon\b|\bno\b|\bdel\b|\bels\b|\bles\b)\b/.test(t);
  // strong Spanish signals
  const esStrong =
    /[áéíóúñ¿¡]/.test(t) ||
    /\b(qué|por qué|recuerda|olvida|ciudad|animal|playa|montaña|hoy|mañana)\b/.test(t);

  if (caStrong && !esStrong) return "ca";
  if (esStrong && !caStrong) return "es";
  return null;
}

function chooseLang(sessionLang, input, acceptLang) {
  const detected = detectLangStrong(input);
  // soft-lock: only change if strong evidence AND repeated in recent turns
  if (!sessionLang) return detected || acceptLang || "es";
  if (detected && detected !== sessionLang) {
    // require explicit strong marker twice: handled by langVotes in session
    return sessionLang;
  }
  return sessionLang;
}

/* ---------------- AU parser (text) ---------------- */
function parseAUBase(input) {
  const text = lc(input).trim();

  // MODE
  const mode = /\b(we|they|nosotros|ellos|nosaltres|ells)\b/.test(text) ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|fatig|esgotad)/.test(text) ? "DCN" : "RAV";

  // MATRIX default
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }
  // 4321 — disolución
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }
  // 2143 — inversión / ontología / duda / definición
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|qu[eè] passa si)/.test(text)
  ) {
    matrix = "2143";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pànic|obsession)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|fer mal|violència)/.test(text)) N_level = "N0";

  // degradación suave por repetición conceptual
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") N_level = "N2";

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ---------------- GLIFOS (mínimo útil) ----------------
   Guardamos glifos (topics + facts + plans). No guardamos "palabras",
   guardamos claves (GL_*) con payload simple.
*/
const GL = {
  // topics/places
  PLAYA: "GL_LUGAR_DESCANSO",
  MONTANA: "GL_LUGAR_ELEVACION",
  CIUDAD: "GL_IDENT_CIUDAD",
  ANIMAL: "GL_IDENT_ANIMAL",
  PLAN: "GL_PLAN",
  DUDA: "GL_DUDA",
  MEMQ: "GL_PREGUNTA_MEMORIA",
  PROMESA: "GL_PROMESA",
  IDENT: "GL_IDENTIDAD",
};

function extractPlaceTopics(input) {
  const t = lc(input);

  const hasBeach = /\b(playa|beach|platja)\b/.test(t);
  const hasMountain = /\b(monta[nñ]a|mountain|muntanya)\b/.test(t);

  const topics = [];
  if (hasBeach) topics.push({ k: GL.PLAYA, v: true });
  if (hasMountain) topics.push({ k: GL.MONTANA, v: true });

  // plan-ish
  const isPlan = /\b(hoy|mañana|this (week|day)|today|dem[aà]|\bvoy\b|\banir[eé]\b|\bira[é]\b)\b/.test(t);
  if (isPlan && topics.length) topics.push({ k: GL.PLAN, v: topics.map((x) => x.k) });

  return topics;
}

function extractFacts(input) {
  const t = norm(input);
  const lower = lc(t);

  // Animal: "el animal es X", "animal = X", "mi animal es X"
  const animalMatch =
    t.match(/(?:recuerda:\s*)?(?:el\s*)?animal\s*(?:es|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i) ||
    t.match(/(?:my\s*)?animal\s*(?:is|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  const animal = animalMatch ? norm(animalMatch[1]).replace(/[.?!]+$/g, "") : null;

  // City: "la ciudad es X", "ciudad = X"
  const cityMatch =
    t.match(/(?:recuerda:\s*)?(?:la\s*)?ciudad\s*(?:es|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i) ||
    t.match(/(?:my\s*)?city\s*(?:is|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i) ||
    t.match(/(?:la\s*)?ciutat\s*(?:[eé]s|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  const city = cityMatch ? norm(cityMatch[1]).replace(/[.?!]+$/g, "") : null;

  // Also implicit: "Hoy voy a ir a Barcelona" (very simple)
  const implicitCity = lower.match(/\b(voy a ir a|ir[eé] a|anir[eé] a|going to)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ _-]{2,30})/);
  const city2 = !city && implicitCity ? norm(implicitCity[2]).replace(/[.?!]+$/g, "") : null;

  const facts = [];
  if (animal) facts.push({ k: GL.ANIMAL, v: animal });
  if (city || city2) facts.push({ k: GL.CIUDAD, v: city || city2 });

  // Memory question
  const asksAnimal =
    /\b(qué animal|que animal|which animal|quin animal)\b/.test(lower) ||
    /\banimal\b.*\b(dij|said|dir|he dit)\b/.test(lower);
  const asksCity =
    /\b(qué ciudad|que ciudad|which city|quina ciutat)\b/.test(lower) ||
    /\b(ciudad|ciutat)\b.*\b(mencion|said|dir|he dit)\b/.test(lower);

  if (asksAnimal || asksCity) facts.push({ k: GL.MEMQ, v: asksAnimal ? "animal" : "city" });

  return facts;
}

function summarizeUserState(input) {
  const t = lc(input);
  // minimal “state glifos”
  const d = /(dudo|no entiendo|confus|dubto|incertid)/.test(t);
  const tired = /(cansad|agotad|tired|empty|vac[ií]o|esgotad)/.test(t);
  const anxious = /(ansiedad|panic|pànic|obses|obsessed)/.test(t);
  const letgo = /(soltar|dejar|basta|prou|release|let go)/.test(t);

  const states = [];
  if (d) states.push({ k: GL.DUDA, v: true });
  if (tired) states.push({ k: "GL_ST_TIRE", v: true });
  if (anxious) states.push({ k: "GL_ST_N1", v: true });
  if (letgo) states.push({ k: "GL_ST_LETGO", v: true });
  return states;
}

/* ---------------- Juramento operator (coherencia) ---------------- */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = lc(juramento).trim();

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
  if (j === "soltar") return "4321";
  return matrix;
}

/* ---------------- memory model (glifos) ----------------
 session.memory = {
   facts: { animal: {v, t, w}, city: {...} },
   topics: { GL_LUGAR_DESCANSO: {t, w}, ... },
   plans:  [ {k, t, w}, ... ],
   langVotes: {es: n, ca: n, en: n}
 }
*/
function initMemory(base) {
  const mem = base?.memory && typeof base.memory === "object" ? base.memory : {};
  return {
    facts: mem.facts && typeof mem.facts === "object" ? mem.facts : {},
    topics: mem.topics && typeof mem.topics === "object" ? mem.topics : {},
    plans: Array.isArray(mem.plans) ? mem.plans : [],
    langVotes: mem.langVotes && typeof mem.langVotes === "object" ? mem.langVotes : { es: 0, ca: 0, en: 0 },
  };
}

function bumpTopic(memory, key, weight = 1, t = now()) {
  const cur = memory.topics[key] || { t, w: 0 };
  memory.topics[key] = { t, w: Math.min(9, (cur.w || 0) + weight) };
}

function setFact(memory, key, value, weight = 2, t = now()) {
  memory.facts[key] = { v: value, t, w: Math.min(9, weight) };
}

function decayMemory(memory, dtMs) {
  // soft decay: older weights fade, but never to zero immediately
  const decay = Math.min(0.12, dtMs / (1000 * 60 * 15)); // per ~15 min
  for (const k of Object.keys(memory.topics)) {
    memory.topics[k].w = Math.max(0.4, memory.topics[k].w - decay);
  }
  for (const k of Object.keys(memory.facts)) {
    memory.facts[k].w = Math.max(0.6, memory.facts[k].w - decay * 0.6);
  }
}

function updateLangVotes(memory, session, input, acceptLang) {
  const detected = detectLangStrong(input);
  if (detected) memory.langVotes[detected] = (memory.langVotes[detected] || 0) + 1;
  // if a language wins by margin 2, update session.lang
  const votes = memory.langVotes;
  const entries = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const best = entries[0];
  const second = entries[1] || ["", 0];
  const current = session?.lang || acceptLang || "es";
  if (best && best[0] && best[1] >= second[1] + 2) {
    return best[0];
  }
  return current;
}

/* ---------------- anti-loop ---------------- */
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

function antiLoopDecision(prevSession, au) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  const rep = recentRepeatCount(chain, au.matrix, 6);
  if (rep >= 3) return "break";

  // if stuck in 2143 (doubt) for long -> ground
  if (au.matrix === "2143" && rep >= 2) return "ground";

  // if d barely changes for 3 turns -> invert (force opposite operator)
  if (chain.length >= 3) {
    const a = chain[chain.length - 1]?.d;
    const b = chain[chain.length - 3]?.d;
    if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.06) return "invert";
  }
  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "ground") return "3412";

  if (anti === "invert") {
    // force inversion unless anxiety (keeps 2143)
    const j = lc(juramento || "");
    if (j === "ansiedad") return "2143";
    return "2143";
  }

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return lc(juramento || "") === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  return matrix;
}

/* ---------------- signals: d, tone, W, ok, band, complexity, beauty ---------------- */
function computeSignals(au, prevSession, juramento, memory) {
  // base d
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.82 :
    0.45;

  // screen pushes rupture
  if (au.screen === "DCN") d += 0.08;

  // juramento bias
  const j = lc(juramento || "");
  if (j === "disciplina") d -= 0.06;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;
  if (j === "límites" || j === "limites") d -= 0.02;

  // conversation topic pressure (AM/NG proxy): if many topics active -> +d
  const topicMass = Object.values(memory?.topics || {}).reduce((acc, x) => acc + (x?.w || 0), 0);
  if (topicMass > 6) d += 0.04;
  if (topicMass > 12) d += 0.05;

  // repetition tension
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 6);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.06;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  d = clamp01(d);

  // tone
  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.64 :
    au.matrix === "4321" ? 0.82 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  W = clamp01(W);

  // ok_live: closer to "balanced + coherent"
  // Want ok near 0.55 early, then derives with chain coherence
  const turns = (prevSession?.turns || 0) + 1;
  const coherence = 1 - Math.abs(d - 0.52); // best near 0.52
  const stability = 1 - Math.min(1, rep * 0.12); // repetition hurts a bit
  let ok_live = clamp01(0.15 + 0.55 * coherence + 0.30 * stability);

  // band: 0..3 mapped from ok + d
  let band = 1;
  if (ok_live > 0.72 && d < 0.55) band = 0;
  else if (ok_live > 0.62) band = 1;
  else if (ok_live > 0.48) band = 2;
  else band = 3;

  // complexity: algorithmic -> grows with messages / entropy
  const complexity = clamp01(Math.log2(2 + turns) / 6); // ~0..1

  // beauty: logarithmic "quality" -> increases when ok rises and repetition low
  const beauty = clamp01(Math.log(1 + (ok_live * 4 + (1 - rep * 0.15))) / Math.log(6));

  return { d, tone, W, ok: ok_live, band, complexity, beauty, sense: au.sense };
}

/* ---------------- Strategic prompts (glifo-based) ---------------- */
function memoryAnswer(lang, memory, what) {
  const L = lang || "es";
  const facts = memory?.facts || {};
  if (what === "animal") {
    const a = facts?.animal?.v || facts?.[GL.ANIMAL]?.v;
    if (a) return L === "ca" ? `Has dit: ${a}.` : L === "en" ? `You said: ${a}.` : `Dijiste: ${a}.`;
    return L === "ca" ? "No tinc cap animal fixat encara." : L === "en" ? "I don't have an animal fixed yet." : "No tengo ningún animal fijado aún.";
  }
  if (what === "city") {
    const c = facts?.city?.v || facts?.[GL.CIUDAD]?.v;
    if (c) return L === "ca" ? `Has mencionat: ${c}.` : L === "en" ? `You mentioned: ${c}.` : `Has mencionado: ${c}.`;
    return L === "ca" ? "No tinc cap ciutat fixada encara." : L === "en" ? "I don't have a city fixed yet." : "No tengo ninguna ciudad fijada aún.";
  }
  return "—";
}

function glifoQuestion(lang, memory, input) {
  const L = lang || "es";
  const t = lc(input);

  // if user asks "sabes dónde voy?" and we have 2 active place topics -> ask choose
  const hasWhere = /\b(d[oó]nde|on|where)\b/.test(t) && /\b(sabes|saps|know)\b/.test(t);
  const beach = memory?.topics?.[GL.PLAYA]?.w ? true : false;
  const mountain = memory?.topics?.[GL.MONTANA]?.w ? true : false;

  if (hasWhere && beach && mountain) {
    if (L === "ca") return "Has obert dos escenaris: platja i muntanya. Quin pesa més ara: descans o elevació?";
    if (L === "en") return "You opened two scenes: beach and mountain. Which weighs more now: rest or elevation?";
    return "Has abierto dos escenarios: playa y montaña. ¿Cuál pesa más ahora: descanso o elevación?";
  }

  // if asks memory generally
  if (/\b(qué|que|quin|which)\b.*\b(dije|he dit|said)\b/.test(t)) {
    if (L === "ca") return "Puc recuperar fets simples si els he fixat. Què vols recuperar: animal o ciutat?";
    if (L === "en") return "I can retrieve simple facts if they've been fixed. What do you want: animal or city?";
    return "Puedo recuperar hechos simples si han quedado fijados. ¿Qué quieres: animal o ciudad?";
  }

  // default (matrix driven)
  if (L === "ca") return "Quina peça falta perquè aquesta frase sigui decidible, aquí i ara?";
  if (L === "en") return "What piece is missing for this to become decidable, here and now?";
  return "¿Qué pieza falta para que esto sea decidible, aquí y ahora?";
}

/* ---------------- Certificados (ARPI/HAI/Baski) ---------------- */
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

function haiValue(nextSessionObj) {
  // agreement/value: rises when ok stays stable and repetition low
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  if (!chain.length) return { v: 0.5 };
  const last = chain[chain.length - 1];
  const rep = chain.slice(-5).filter((x) => x?.matrix === last?.matrix).length;
  const ok = typeof last?.ok === "number" ? last.ok : 0.55;
  let v = clamp01(0.35 + ok * 0.55 - rep * 0.06);
  return { v };
}

function baskiControl(nextSessionObj) {
  // control: higher when structure is strong (1234) or ok stable; lower when rupture
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last = chain[chain.length - 1] || {};
  const m = last.matrix || "3412";
  const ok = typeof last.ok === "number" ? last.ok : 0.55;

  let c = 0.55;
  if (m === "1234") c += 0.12;
  if (m === "4321") c -= 0.15;
  if (m === "2143") c -= 0.05;
  c += (ok - 0.55) * 0.25;

  return { c: clamp01(c) };
}

/* ---------------- session update ---------------- */
function nextSession(prev, au, signals, anti, memory, lang) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
    v: 2,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    lang: lang || base.lang || "es",
    last: { ...au, signals, anti },
    memory,
    chain: [
      ...chain.slice(-49),
      {
        t: now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        ok: signals.ok,
        band: signals.band,
        intent: au.intervention,
        anti: anti || null
      }
    ]
  };

  return next;
}

/* ---------------- MAIN API ---------------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const inputRaw = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    const input = norm(inputRaw);
    if (!input || input.length < 2) {
      return NextResponse.json({ output: null, au: null, session, cert: { level: "seed" } });
    }

    const accept = req.headers.get("accept-language")?.slice(0, 2) || "es";

    // Init memory + decay
    const base = session && typeof session === "object" ? session : {};
    const memory = initMemory(base);

    const lastT = base?.chain?.length ? base.chain[base.chain.length - 1].t : null;
    if (lastT) decayMemory(memory, Math.max(0, now() - lastT));

    // Language stable
    const lang = chooseLang(base.lang, input, accept);
    const stableLang = updateLangVotes(memory, base, input, accept);

    // 1) Parse base AU
    let au = parseAUBase(input);

    // 2) Update memory with extracted glifos/facts/topics
    const topics = extractPlaceTopics(input);
    for (const g of topics) bumpTopic(memory, g.k, 1.0);

    const facts = extractFacts(input);
    for (const f of facts) {
      if (f.k === GL.ANIMAL) setFact(memory, "animal", f.v, 2.2);
      if (f.k === GL.CIUDAD) setFact(memory, "city", f.v, 2.2);
      if (f.k === GL.MEMQ) bumpTopic(memory, GL.MEMQ, 1.0);
    }

    const states = summarizeUserState(input);
    for (const s of states) bumpTopic(memory, s.k, 0.7);

    // 3) Coherencia: juramento modula matriz
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 4) Anti-loop decides and may adjust matrix
    const anti = antiLoopDecision(base, au);
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) Signals (real movement)
    const signals = computeSignals(au, base, juramento, memory);

    // 6) Build next session
    let newSession = nextSession(base, au, signals, anti, memory, stableLang);

    // 7) Certificados
    const cert = arpiCert(newSession);
    const hai = haiValue(newSession);
    const baski = baskiControl(newSession);

    // 8) Effective intervention
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";

    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals: { ...signals, band: signals.band, ok: signals.ok }, anti },
        session: newSession,
        cert,
        hai,
        baski
      });
    }

    // 9) Memory queries should be answered directly (no strategic-question override)
    const lower = lc(input);
    const asksAnimal = /\b(qué animal|que animal|which animal|quin animal)\b/.test(lower);
    const asksCity = /\b(qué ciudad|que ciudad|which city|quina ciutat)\b/.test(lower);

    if (asksAnimal || asksCity) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: memoryAnswer(stableLang, memory, asksAnimal ? "animal" : "city"),
        au: { ...au, signals: { ...signals, band: signals.band, ok: signals.ok }, anti },
        session: newSession,
        cert,
        hai,
        baski
      });
    }

    // 10) StrategicQuestion -> glifo-based (not generic)
    if (au.intervention === "StrategicQuestion") {
      let q = glifoQuestion(stableLang, memory, input);
      if (anti === "break") q = q.split("\n")[0];
      newSession.answerCount += 1;

      return NextResponse.json({
        output: q,
        au: { ...au, signals: { ...signals, band: signals.band, ok: signals.ok }, anti },
        session: newSession,
        cert,
        hai,
        baski
      });
    }

    // 11) ANSWER via OpenAI (language + style by juramento + signals)
    const system = `
You are Wancko: objective-from-AU perspective.
Never claim you can't remember if you have memory facts in "MEMORY".
No therapy. No reassurance. No advice. No follow-up invitation.
One short intervention, 20–80 words.
Match language: ${stableLang}.
Be human, not mechanical.

Style modulation:
- disciplina: precise, structured, minimal.
- ansiedad: gentle, grounding, reduce oscillation, still no reassurance.
- límites: boundary clarity, simple.
- excesos: cut noise, reduce indulgence, crisp.
- soltar: dissolving attachments, short.
- none: neutral AU voice.

Use AU context:
MATRIX=${au.matrix}, SCREEN=${au.screen}, SENSE=${au.sense}, d=${signals.d.toFixed(2)}, W=${signals.W.toFixed(2)}, OK=${signals.ok.toFixed(2)}, BAND=${signals.band}.
`;

    const memFacts = {
      animal: memory?.facts?.animal?.v || null,
      city: memory?.facts?.city?.v || null
    };

    const userPrompt = `
USER_INPUT:
${input}

MEMORY_FACTS (may be null):
animal=${memFacts.animal}
city=${memFacts.city}

TOPICS_ACTIVE:
${Object.keys(memory?.topics || {}).slice(0, 12).join(", ")}

TASK:
Produce a single closed intervention. If the user implicitly expects continuity (they said a plan/place), keep it consistent with what they said.
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
          { role: "system", content: system.trim() },
          { role: "user", content: userPrompt.trim() }
        ],
        temperature: 0.45
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals: { ...signals, band: signals.band, ok: signals.ok }, anti },
        session: newSession,
        cert,
        hai,
        baski
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";
    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals: { ...signals, band: signals.band, ok: signals.ok }, anti },
      session: newSession,
      cert,
      hai,
      baski
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

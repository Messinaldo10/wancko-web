// /lib/auhash/kernel.js
// AU_HASH kernel — funciones puras (sin side-effects)
// - extractGlyphs(text, lang)
// - updateAUHash(prev, glyphs, role)
// - resolveQuery(text) -> { type, domain?, intent? }
// - retrieve(auhash, domain, queryText?, lang?) -> { ok, value, candidates? }

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

/** ---------------------------
 *  Lang helpers
 * --------------------------- */
export function detectLang(text = "") {
  const t = String(text).toLowerCase();
  // Català
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(per què|què|quin|on|avui|mercat)\b/.test(t)) return "ca";
  // Español
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|dónde|hoy|recuerda|olvida|mercado)\b/.test(t)) return "es";
  // default
  return "en";
}

/** ---------------------------
 *  AU basic “Glyph” dictionary v1
 *  - Puedes ampliarlo sin romper el kernel.
 *  - domain: LUGAR / ANIMAL / CIUDAD / TIEMPO / ACTIVIDAD / IDENTIDAD / ...
 * --------------------------- */
const GL = {
  // Domains
  LUGAR: "DOM.LUGAR",
  CIUDAD: "DOM.CIUDAD",
  ANIMAL: "DOM.ANIMAL",
  ACTIVIDAD: "DOM.ACTIVIDAD",
  TIEMPO: "DOM.TIEMPO",
  IDENTIDAD: "DOM.IDENTIDAD",
  CLIMA: "DOM.CLIMA",
};

// “Alias” multi-idioma -> { domain, glyph, canonical }
const ALIASES = [
  // --- LUGAR ---
  { re: /\b(playa|platja|beach)\b/i, domain: "LUGAR", glyph: "LUGAR.PLAYA", canonical: { es: "playa", ca: "platja", en: "beach" } },
  { re: /\b(monta(ñ|n)a|muntanya|mountain)\b/i, domain: "LUGAR", glyph: "LUGAR.MONTANA", canonical: { es: "montaña", ca: "muntanya", en: "mountain" } },
  { re: /\b(mercado|mercat|market)\b/i, domain: "LUGAR", glyph: "LUGAR.MERCADO", canonical: { es: "mercado", ca: "mercat", en: "market" } },
  { re: /\b(ciudad|ciutat|city)\b/i, domain: "CIUDAD", glyph: "CIUDAD.GENERICA", canonical: { es: "ciudad", ca: "ciutat", en: "city" } },

  // --- ANIMAL ---
  { re: /\b(cabra|goat)\b/i, domain: "ANIMAL", glyph: "ANIMAL.CABRA", canonical: { es: "cabra", ca: "cabra", en: "goat" } },
  { re: /\b(gorila|gorilla)\b/i, domain: "ANIMAL", glyph: "ANIMAL.GORILA", canonical: { es: "gorila", ca: "goril·la", en: "gorilla" } },

  // --- ACTIVIDAD ---
  { re: /\b(rafting)\b/i, domain: "ACTIVIDAD", glyph: "ACTIVIDAD.RAFTING", canonical: { es: "rafting", ca: "rafting", en: "rafting" } },
  { re: /\b(caminar|pasear|walk)\b/i, domain: "ACTIVIDAD", glyph: "ACTIVIDAD.CAMINAR", canonical: { es: "caminar", ca: "caminar", en: "walk" } },

  // --- CLIMA ---
  { re: /\b(tiempo|clima|temps|weather)\b/i, domain: "CLIMA", glyph: "CLIMA.GENERAL", canonical: { es: "tiempo", ca: "temps", en: "weather" } },

  // --- IDENTIDAD ---
  { re: /\b(qu[ií]en eres|qui ets|who are you)\b/i, domain: "IDENTIDAD", glyph: "IDENTIDAD.QUIEN", canonical: { es: "quién eres", ca: "qui ets", en: "who are you" } },
];

// “recuerda:” / “apunta” patterns
const FIX_PATTERNS = [
  // es
  { re: /\b(recuerda|apunta)\b/i, lang: "es" },
  // ca
  { re: /\b(recorda|apunta)\b/i, lang: "ca" },
  // en
  { re: /\b(remember|note)\b/i, lang: "en" },
];

function hasFixIntent(text) {
  return FIX_PATTERNS.some((p) => p.re.test(text));
}

// Captura “Recuerda: X = Y” (multi idioma y variantes)
function parseKeyValue(text) {
  const t = String(text).trim();
  // soporta: "Recuerda: animal = la cabra", "Apunta: ciudad es Barcelona", etc.
  // 1) con "="
  const eq = t.match(/:\s*([^=]+?)\s*=\s*(.+)$/i) || t.match(/\b([^=]+?)\s*=\s*(.+)$/i);
  if (eq) return { key: eq[1].trim(), value: eq[2].trim(), style: "eq" };

  // 2) con "es"
  const is = t.match(/:\s*(.+?)\s+(es|és|is)\s+(.+)$/i) || t.match(/\b(.+?)\s+(es|és|is)\s+(.+)$/i);
  if (is) return { key: is[1].trim(), value: is[3].trim(), style: "is" };

  return null;
}

// Hash estable simple (no críptico) para “signature”
function stableHash(str) {
  const s = String(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "AUH:" + (h >>> 0).toString(16).padStart(8, "0");
}

/** ---------------------------
 *  extractGlyphs(text, lang)
 *  - Produce tokens de glifos (no literal memory)
 * --------------------------- */
export function extractGlyphs(text, lang) {
  const L = lang || detectLang(text);
  const t = String(text || "").trim();
  const lower = t.toLowerCase();

  const out = [];
  const seen = new Set();

  // 1) Si hay intención de fijar (“recuerda/apunta”), tratamos key/value si existe
  const fix = hasFixIntent(lower);
  const kv = fix ? parseKeyValue(t) : null;

  if (kv) {
    // Intentamos resolver domain y glyph por el valor si coincide con alias
    let matched = null;
    for (const a of ALIASES) {
      if (a.re.test(kv.value)) {
        matched = a;
        break;
      }
    }

    const domainGuess = guessDomainFromKey(kv.key, L);
    const domain = matched?.domain || domainGuess || "IDENTIDAD";
    const glyph = matched?.glyph || makeFreeGlyph(domain, kv.value, L);

    out.push({
      type: "fix",
      domain,
      glyph,
      value: normalizeValue(kv.value),
      weight: 0.72,
      stickiness: 0.12,
      operators: ["C"], // fijar = coherencia
      signature: stableHash(`${domain}:${glyph}:${kv.value}`),
      lang: L,
      raw: t,
    });

    return out;
  }

  // 2) Extracción normal por alias
  for (const a of ALIASES) {
    if (a.re.test(t)) {
      const id = a.glyph;
      if (seen.has(id)) continue;
      seen.add(id);

      out.push({
        type: "mention",
        domain: a.domain,
        glyph: a.glyph,
        value: a.canonical?.[L] || a.canonical?.en || a.glyph,
        weight: 0.58,
        stickiness: 0.18,
        operators: ["R"], // mencionar = revelación
        signature: stableHash(`${a.domain}:${a.glyph}`),
        lang: L,
        raw: t,
      });
    }
  }

  // 3) Si no detectamos nada, devolvemos vacío (el LLM decide)
  return out;
}

function normalizeValue(v) {
  return String(v || "").trim();
}

function guessDomainFromKey(key, lang) {
  const k = String(key || "").toLowerCase();
  if (/\b(animal|animal)\b/.test(k)) return "ANIMAL";
  if (/\b(ciudad|ciutat|city|poblaci[oó]n)\b/.test(k)) return "CIUDAD";
  if (/\b(lugar|lloc|where|donde|on)\b/.test(k)) return "LUGAR";
  if (/\b(actividad|activitat|activity)\b/.test(k)) return "ACTIVIDAD";
  if (/\b(tiempo|temps|time)\b/.test(k)) return "TIEMPO";
  return null;
}

// Si usuario dice un valor libre: “la ciudad es Barcelona”
function makeFreeGlyph(domain, value, lang) {
  const v = normalizeValue(value);
  // solo etiqueta, el valor literal se queda en topic.value
  const safe = v
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .slice(0, 32);
  return `${domain}.FREE_${safe || "x"}`.toUpperCase();
}

/** ---------------------------
 * resolveQuery(text)-> domain/intento
 * --------------------------- */
export function resolveQuery(text) {
  const t = String(text || "").toLowerCase();

  // “qué animal dije / qué ciudad mencioné”
  const askSaid =
    /\b(qué|que|quin|which|what)\b/.test(t) &&
    /\b(dije|he dit|said|mentioned|mencion[eé])\b/.test(t);

  if (askSaid && /\b(animal)\b/.test(t)) return { type: "recall", domain: "ANIMAL" };
  if (askSaid && /\b(ciudad|ciutat|city)\b/.test(t)) return { type: "recall", domain: "CIUDAD" };
  if (askSaid && /\b(lugar|lloc|where|d[oó]nde|on)\b/.test(t)) return { type: "recall", domain: "LUGAR" };

  // “sabes dónde voy / a dónde voy”
  if (/\b(d[oó]nde|where|on)\b/.test(t) && /\b(voy|vaig|going)\b/.test(t)) {
    return { type: "recall", domain: "LUGAR" };
  }

  // “quién eres”
  if (/\b(qu[ií]en eres|qui ets|who are you)\b/.test(t)) return { type: "identity", domain: "IDENTIDAD" };

  return { type: "none" };
}

/** ---------------------------
 * updateAUHash(prev, glyphs, role)
 * - actualiza memoria temática + ciclo simple
 * --------------------------- */
export function updateAUHash(prev, glyphs, role) {
  const base = isObj(prev) ? structuredClone(prev) : makeEmptyAUHash();

  const t = nowSec();
  const r = role === "assistant" ? "assistant" : "user";

  // init
  base.version = base.version || 1;
  base.memory = base.memory || { topics: {} };
  base.cycle = base.cycle || makeEmptyCycle();
  base.profile = base.profile || {};

  // 1) actualizar topics por cada glyph
  for (const g of Array.isArray(glyphs) ? glyphs : []) {
    if (!g?.domain) continue;

    const dom = g.domain;
    const topic = base.memory.topics[dom] || {
      domain: dom,
      glyph: null,
      value: null,
      strength: 0,
      stability: 0,
      stickiness: 0,
      lastSeen: 0,
      conflicts: [],
      history: [],
    };

    // regla: mention sube poco, fix sube más
    const delta = g.type === "fix" ? 0.16 : 0.08;

    // decay (ligero) con el tiempo
    const age = topic.lastSeen ? Math.max(0, t - topic.lastSeen) : 0;
    const decay = age > 0 ? Math.min(0.12, age / (60 * 60 * 24) * 0.06) : 0; // ~diario
    topic.strength = clamp01((topic.strength || 0) - decay);

    // update
    topic.glyph = g.glyph || topic.glyph;
    topic.value = g.value ?? topic.value;
    topic.strength = clamp01((topic.strength || 0) + delta);
    topic.stickiness = clamp01((topic.stickiness || 0) + (g.stickiness ?? 0.02) * 0.15);
    topic.stability = clamp01((topic.stability || 0) + (g.type === "fix" ? 0.08 : 0.03));
    topic.lastSeen = t;
    topic.history = [...(topic.history || []).slice(-20), { t, delta }];

    base.memory.topics[dom] = topic;
  }

  // 2) ciclo simple: complejidad/belleza dependen de #mensajes (aquí: turns)
  base.cycle.turns = (base.cycle.turns || 0) + 1;
  const turns = base.cycle.turns;

  // complexity ~ log-ish de turns
  base.cycle.complexity = clamp01(Math.log10(1 + turns) / 2); // 0..~0.5 a 10 turns, ~0.66 a 100

  // beauty ~ coherencia: nº dominios con strength alto vs total
  const topics = base.memory.topics || {};
  const doms = Object.keys(topics);
  const strong = doms.filter((d) => (topics[d]?.strength || 0) >= 0.55).length;
  base.cycle.beauty = doms.length === 0 ? 0.5 : clamp01(0.35 + (strong / doms.length) * 0.55);

  // ok_live: mezcla simple (ajustable): belleza - stickiness promedio
  const stickAvg = doms.length
    ? doms.reduce((a, d) => a + (topics[d]?.stickiness || 0), 0) / doms.length
    : 0.15;
  base.cycle.ok_live = clamp01(base.cycle.beauty - 0.35 * stickAvg);

  // band: 1..4 por complejidad (placeholder operativo)
  base.cycle.band = 1 + Math.min(3, Math.floor(base.cycle.complexity * 4));

  // 999999 scaffold
  base.cycle.entropyN = clamp999999(Math.floor((1 - base.cycle.ok_live) * 999999));
  base.cycle.negentropy = clamp999999(Math.floor(base.cycle.ok_live * 999999));
  base.cycle.Nstate = clamp999999(Math.floor((base.cycle.entropyN + base.cycle.negentropy) / 2));

  // Dominance placeholder: user messages empujan a Wancko dominar (objetividad AU del diálogo)
  base.cycle.dominance = base.cycle.dominance || { wancko: 0.5, hwancko: 0.5 };
  if (r === "user") base.cycle.dominance.wancko = clamp01(base.cycle.dominance.wancko + 0.01);
  if (r === "assistant") base.cycle.dominance.wancko = clamp01(base.cycle.dominance.wancko - 0.005);
  base.cycle.dominance.hwancko = clamp01(1 - base.cycle.dominance.wancko);

  return base;
}

function clamp999999(x) {
  return Math.max(0, Math.min(999999, x | 0));
}

function makeEmptyAUHash() {
  return {
    version: 1,
    mode: "WANCKO",
    parathermia: { T: 0.5, P: 0.5, W: 0.5, I: 0.5 },
    cycle: makeEmptyCycle(),
    memory: { topics: {} },
    profile: { juramento: null, wanckoMatrixBias: "3412", hwanckoMirrorBias: "4321" },
  };
}

function makeEmptyCycle() {
  return {
    turns: 0,
    matrix: "3412",
    antiLoop: null,
    entropyN: 500000,
    negentropy: 500000,
    Nstate: 500000,
    ok_live: 0.5,
    band: 2,
    complexity: 0.3,
    beauty: 0.5,
    dominance: { wancko: 0.5, hwancko: 0.5 },
  };
}

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

/** ---------------------------
 * retrieve(auhash, domain, queryText?, lang?)
 * - devuelve un hecho si:
 *   (strength - stickiness) * ok_live > umbral
 * - si hay conflicto (dos fuertes), devuelve candidates (para que UI o route decida)
 * --------------------------- */
export function retrieve(auhash, domain, queryText, lang) {
  const A = isObj(auhash) ? auhash : makeEmptyAUHash();
  const topics = A.memory?.topics || {};
  const cyc = A.cycle || makeEmptyCycle();
  const ok = cyc.ok_live ?? 0.5;

  const dom = domain;
  const topic = topics[dom];
  if (!topic) return { ok: false, value: null, reason: "no_topic" };

  const score = (topic.strength || 0) - (topic.stickiness || 0);
  const gate = score * ok;

  // threshold “vivo” (no fijo): con baja belleza sube el umbral
  const th = 0.18 + (0.18 * (1 - (cyc.beauty ?? 0.5)));

  if (gate < th) return { ok: false, value: null, reason: "below_threshold", score: gate };

  // conflicto simple: si tenemos dos dominios "LUGAR" recientes (playa y montaña), aquí NO preguntamos.
  // Solo devolvemos candidates si detectamos ambigüedad (lo implementaremos en route con el hash de query).
  return {
    ok: true,
    value: topic.value ?? topic.glyph,
    glyph: topic.glyph,
    score: gate,
  };
}

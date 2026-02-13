// lib/auhash/minimal.ts
import type { AUHashState, AUHashTopic, Lang, AUGlyph } from "./kernel";

/* =========================================================
   Types (exported)
========================================================= */

export type MemoryHit = {
  key: string;      // hash estable (k)
  token: string;    // prestado (desde meta.topHistory), puede ser ""
  domain: string;
  w: number;
  last: number;
  suspendedUntil: number;
  phon: AUGlyph[];
};

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function nowMs(): number {
  return Date.now();
}

function normalizeTokens(t: string): string[] {
  return (t || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** hash determinista corto (clave interna) */
export function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "T" + (h >>> 0).toString(16);
}

/* =========================================================
   “Stopwords” estructurales (no concepto)
========================================================= */

const STOP = new Set<string>([
  // ES
  "hola", "como", "qué", "que", "por", "porqué", "porque", "donde", "dónde",
  "yo", "tu", "tú", "el", "la", "los", "las", "un", "una", "de", "del", "y", "o",
  "hoy", "ahora", "muy", "mucho", "muchas", "cosas",
  "estoy", "estas", "estás", "eres", "soy", "ser", "hacer", "voy", "ire", "iré",

  // CA
  "com", "què", "que", "per", "perquè", "per", "on",
  "avui", "ara", "molt", "moltes", "coses",
  "estic", "estas", "estàs", "ets", "sóc", "ser", "fer", "vaig", "anire", "aniré",

  // EN
  "hello", "hi", "how", "what", "where", "why",
  "i", "you", "the", "a", "an", "of", "to", "and", "or",
  "today", "now", "very", "much",
  "am", "are", "is", "be", "do", "go"
]);

function isStructural(tok: string): boolean {
  if (!tok) return true;
  if (tok.length < 3) return true;
  return STOP.has(tok);
}

/* =========================================================
   Dominio semántico (humano)
========================================================= */

export function inferDomain(token: string): string {
  const t = token.toLowerCase();

  // identidad / agente
  if (["identidad", "yo", "qui", "quien", "who", "self"].includes(t)) return "identidad";

  // memoria / tiempo
  if (["recuerdo", "memoria", "pasado", "antes", "ayer", "record", "memory"].includes(t)) return "memoria";

  // estructura / sistema
  if (["estructura", "sistema", "orden", "regla", "norma", "model", "system"].includes(t)) return "estructura";

  // lugar / orientación
  if (["casa", "hogar", "mercat", "mercado", "platja", "playa", "muntanya", "montaña", "ciudad", "calle"].includes(t)) return "lugar";

  // cuerpo / fisiología
  if (["cuerpo", "cos", "menjar", "menjaré", "menjare", "comer", "comeré", "calamars", "calamares"].includes(t)) return "cuerpo";

  // impulso / deseo / hambre
  if (["gana", "hambre", "fam", "miedo", "por", "deseo", "urge", "ansiedad"].includes(t)) return "impulso";

  // cosmos / verdad
  if (["univers", "universo", "etern", "eterno", "verdad", "realidad"].includes(t)) return "cosmos";

  return "tema";
}

/* =========================================================
   Fonética AU (glifos) — “letras = no-AU” → glifos numéricos
   Idea: cada letra genera número (base), y transiciones generan “salir/entrar”.
   Aquí lo mantenemos simple y estable (pero extensible).
========================================================= */

/** mapa base por carácter (0..31) */
function glyphOfChar(ch: string): number {
  const c = ch.toLowerCase();
  // letras latinas básicas
  if (c >= "a" && c <= "z") return (c.charCodeAt(0) - 97) % 32;
  // vocales acentuadas / ñ / ç / l·l etc (aprox)
  if ("áàäâ".includes(c)) return glyphOfChar("a");
  if ("éèëê".includes(c)) return glyphOfChar("e");
  if ("íïìî".includes(c)) return glyphOfChar("i");
  if ("óòöô".includes(c)) return glyphOfChar("o");
  if ("úüùû".includes(c)) return glyphOfChar("u");
  if (c === "ñ") return 27;
  if (c === "ç") return 28;
  return 31; // “otro”
}

/**
 * phoneticAU:
 * - produce glifos por transiciones: enter(letter), exit(letter)
 * - encode: g = base(letter) y g' = 32 + base(letter) (salida)
 */
export function phoneticAU(token: string): AUGlyph[] {
  const chars = Array.from((token || "").trim());
  if (chars.length === 0) return [];

  const out: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const g = glyphOfChar(chars[i]);
    // entrar
    out.push(g);
    // salir (marca inversa)
    out.push(32 + g);
  }

  // compresión simple: corta longitud pero preserva jerarquía
  return out.slice(0, 24);
}

/* =========================================================
   Estado v2
========================================================= */

export function ensureState(prev?: AUHashState | null): AUHashState {
  const now = nowMs();

  if (
    prev &&
    typeof prev === "object" &&
    prev.v === 2 &&
    prev.memory &&
    prev.memory.topics &&
    prev.memory.meta &&
    Array.isArray(prev.memory.meta.events)
  ) {
    return prev;
  }

  return {
    v: 2,
    t0: now,
    t: now,
    memory: {
      topics: {},
      langVotes: { es: 0, ca: 0, en: 0 },
      meta: {
        stuckCount: 0,
        lastPickedKey: null,
        topHistory: [],
        events: []
      }
    }
  };
}

/* =========================================================
   Ingesta (no guarda “palabra” como verdad)
   - topics por key estable (hash)
   - phon/g glifos
   - token humano SOLO como prestado en meta.topHistory/events
========================================================= */

export function ingestText(
  prev: AUHashState | null | undefined,
  text: string,
  role: "user" | "assistant",
  langHint?: Lang
): AUHashState {
  const s = ensureState(prev);
  const now = nowMs();

  const raw = (text || "").trim();
  if (!raw) return { ...s, t: now };

  // votos de idioma (ligero)
  const langVotes = { ...s.memory.langVotes };
  if (langHint) langVotes[langHint] = (langVotes[langHint] || 0) + (role === "user" ? 2 : 1);

  const tokens = normalizeTokens(raw);

  const topics: Record<string, AUHashTopic> = { ...s.memory.topics };

  // delta por rol
  const delta = role === "user" ? 0.08 : 0.04;

  // tomamos candidatos no estructurales
  const candidates = tokens.filter((x) => !isStructural(x)).slice(0, 12);

  for (const token of candidates) {
    const key = hashKey(token);
    const prevTopic = topics[key];

    // si está suspendido, igual puede “rozarse” pero con poco peso
    const suspendedUntil = prevTopic?.suspendedUntil ?? 0;
    const isSuspended = suspendedUntil > now;

    const wPrev = prevTopic?.w ?? 0;
    const wNew = clamp01(wPrev + (isSuspended ? delta * 0.25 : delta));

    const domain = prevTopic?.domain || inferDomain(token);
    const phon = prevTopic?.phon?.length ? prevTopic.phon : phoneticAU(token);
    const g = prevTopic?.g?.length ? prevTopic.g : []; // reservado

    topics[key] = {
      w: wNew,
      last: now,
      phon,
      domain,
      g,
      suspendedUntil
    };
  }

  return {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      topics,
      langVotes,
      meta: {
        ...s.memory.meta
      }
    }
  };
}

/* =========================================================
   Query (devuelve token prestado mirando topHistory)
   - NO expone el hash como texto al usuario
========================================================= */

function borrowedTokenForKey(s: AUHashState, key: string): string {
  // buscamos el más reciente en topHistory
  for (let i = s.memory.meta.topHistory.length - 1; i >= 0; i--) {
    const h = s.memory.meta.topHistory[i];
    if (h.key === key && h.token) return h.token;
  }
  return "";
}

export function queryMemory(
  state: AUHashState | null | undefined,
  topN: number = 6
): MemoryHit[] {
  const s = ensureState(state);
  const now = nowMs();

  const entries = Object.entries(s.memory.topics || {});

  // filtra suspendidos para “competición”
  const active = entries.filter(([, v]) => (v?.suspendedUntil ?? 0) <= now);

  active.sort((a, b) => (b[1]?.w ?? 0) - (a[1]?.w ?? 0));

  return active.slice(0, topN).map(([key, v]) => ({
    key,
    token: borrowedTokenForKey(s, key),
    domain: v.domain,
    w: v.w,
    last: v.last,
    suspendedUntil: v.suspendedUntil,
    phon: v.phon
  }));
}

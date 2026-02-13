// lib/auhash/minimal.ts
import type { AUHashState, AUHashTopic, Lang, AUGlyph } from "./kernel";

/* =========================================================
   Tipos públicos
========================================================= */

export type MemoryHit = {
  key: string;          // clave estable (por ahora: token normalizado)
  token: string;        // token humano (mismo que key por ahora)
  w: number;
  last: number;
  domain: string;
  phon: AUGlyph[];
  suspended: boolean;
};

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function normalizeTokens(t: string): string[] {
  return (t || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Fonética AU provisional: convierte letras a glifos (1..26) */
function phoneticAU(token: string): AUGlyph[] {
  const out: AUGlyph[] = [];
  for (const ch of token.toLowerCase()) {
    const code = ch.codePointAt(0) ?? 0;
    // a..z
    if (code >= 97 && code <= 122) out.push(code - 96);
    // áéíóúñç (aprox)
    else if ("áàä".includes(ch)) out.push(1);
    else if ("éèë".includes(ch)) out.push(5);
    else if ("íìï".includes(ch)) out.push(9);
    else if ("óòö".includes(ch)) out.push(15);
    else if ("úùü".includes(ch)) out.push(21);
    else if (ch === "ñ") out.push(14);
    else if (ch === "ç") out.push(3);
  }
  return out.length ? out : [0];
}

/* =========================================================
   Stopwords estructurales (NO conceptos)
========================================================= */

const STOPWORDS = new Set([
  // saludos / muletillas
  "hola", "hey", "buenas", "bon", "bones", "vale", "ok",
  // copula / auxiliar ultra-frecuente
  "estas", "estás", "estoy", "eres", "soy", "ser", "estar",
  // pronombres / artículos / conectores
  "yo", "tu", "tú", "el", "la", "los", "las", "un", "una", "unos", "unas",
  "a", "de", "del", "al", "que", "y", "o", "en", "por", "para", "con", "sin",
  "como", "com", "què", "que", "porque", "porquè", "perquè",
]);

/* =========================================================
   Dominio semántico humano
========================================================= */

function inferDomain(token: string): string {
  const t = token.toLowerCase();

  // identidad / agencia
  if (["identidad", "quien", "qui", "persona", "yo", "ego"].includes(t)) return "identidad";

  // memoria
  if (["recuerdo", "record", "memoria", "pasado", "ahir", "ayer"].includes(t)) return "memoria";

  // estructura / sistema
  if (["estructura", "sistema", "orden", "regla", "norma"].includes(t)) return "estructura";

  // impulso / deseo
  if (["gana", "ganas", "hambre", "set", "sed", "deseo", "miedo"].includes(t)) return "impulso";

  // cuerpo / fisiología
  if (["cuerpo", "dolor", "calamars", "calamares", "menjar", "menjaré", "menjare", "comer", "comeré", "comere"].includes(t)) return "cuerpo";

  // lugar
  if (["casa", "mercat", "mercado", "platja", "playa", "muntanya", "montaña", "ciudad", "barcelona"].includes(t)) return "lugar";

  // tiempo
  if (["avui", "hoy", "demà", "mañana", "tarde", "noche", "ahir", "ayer"].includes(t)) return "tiempo";

  // cosmos
  if (["univers", "universo", "etern", "eterno", "cosmos", "infinito"].includes(t)) return "cosmos";

  // acción / movimiento
  if (["anar", "aniré", "anire", "iré", "ire", "voy", "mover", "salir"].includes(t)) return "acción";

  return "tema";
}

/* =========================================================
   Estado
========================================================= */

export function ensureState(prev?: AUHashState | null): AUHashState {
  if (prev && typeof prev === "object" && prev.memory && prev.v === 2) return prev;

  const now = Date.now();

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
        events: [],
      },
    },
  };
}

/* =========================================================
   Ingesta
========================================================= */

export function ingestText(
  prev: AUHashState | null | undefined,
  text: string,
  role: "user" | "assistant",
  langHint?: Lang
): AUHashState {
  const s = ensureState(prev);
  const now = Date.now();

  const trimmed = (text || "").trim();
  if (!trimmed) return { ...s, t: now };

  const tokens = normalizeTokens(trimmed);
  const topics = { ...(s.memory.topics || {}) };

  // voto de idioma (suave)
  const lv = { ...(s.memory.langVotes || { es: 0, ca: 0, en: 0 }) };
  if (langHint) lv[langHint] = (lv[langHint] || 0) + 1;

  const deltaBase = role === "user" ? 0.08 : 0.04;

  for (const raw of tokens.slice(0, 14)) {
    const key = raw.trim();
    if (!key) continue;
    if (key.length < 3) continue;
    if (STOPWORDS.has(key)) continue;

    const prevTopic = topics[key];
    const wPrev = prevTopic?.w ?? 0;

    // si está suspendido, igual puede “rozar” pero menos
    const suspended = (prevTopic?.suspendedUntil ?? 0) > now;
    const delta = suspended ? deltaBase * 0.25 : deltaBase;

    const wNew = clamp01(wPrev + delta);

    const domain = prevTopic?.domain ?? inferDomain(key);
    const phon = prevTopic?.phon ?? phoneticAU(key);

    const topic: AUHashTopic = {
      w: wNew,
      last: now,
      phon,
      domain,
      g: prevTopic?.g ?? [],
      suspendedUntil: prevTopic?.suspendedUntil ?? 0,
    };

    topics[key] = topic;
  }

  return {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      topics,
      langVotes: lv,
    },
  };
}

/* =========================================================
   Consulta memoria (top hits)
========================================================= */

export function queryMemory(
  state: AUHashState | null | undefined,
  topN: number = 8
): MemoryHit[] {
  const s = ensureState(state);
  const now = Date.now();

  const entries = Object.entries(s.memory.topics || {});
  entries.sort((a, b) => (b[1]?.w ?? 0) - (a[1]?.w ?? 0));

  const out: MemoryHit[] = [];

  for (const [k, v] of entries) {
    const suspended = (v.suspendedUntil ?? 0) > now;
    out.push({
      key: k,
      token: k,
      w: v.w ?? 0,
      last: v.last ?? 0,
      domain: v.domain ?? inferDomain(k),
      phon: v.phon ?? phoneticAU(k),
      suspended,
    });
    if (out.length >= topN) break;
  }

  return out;
}

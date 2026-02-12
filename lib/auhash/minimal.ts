import type { AUHashState, AUHashTopic, Lang } from "./kernel";

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function normalizeTokens(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/* =========================================================
   Stopwords estructurales (NO conceptos)
========================================================= */

const STOPWORDS = new Set([
  "hola",
  "estas",
  "estás",
  "aniré",
  "anire",
  "tinc",
  "menjaré",
  "menjare",
  "voy",
  "iré",
  "ire",
  "estoy",
  "eres",
  "soy",
  "ser",
  "hacer",
  "hoy",
  "avui",
  "como",
  "com",
  "la",
  "el",
  "a",
  "de",
  "que",
  "y"
]);

/* =========================================================
   Estado
========================================================= */

export function ensureState(prev?: AUHashState | null): AUHashState {
  if (prev && typeof prev === "object" && prev.memory) return prev;

  const now = Date.now();

  return {
    v: 1,
    t0: now,
    t: now,
    memory: {
      topics: {},
      langVotes: { es: 0, ca: 0, en: 0 }
    }
  };
}

/* =========================================================
   Ingesta semántica con acumulación suave
========================================================= */

export function ingestText(
  prev: AUHashState | null | undefined,
  text: string,
  role: "user" | "assistant",
  langHint?: Lang
): AUHashState {

  const s = ensureState(prev);
  const now = Date.now();

  if (!text?.trim()) {
    return { ...s, t: now };
  }

  const tokens = normalizeTokens(text);
  const topics = { ...s.memory.topics };

  for (const raw of tokens.slice(0, 12)) {
    const key = raw.trim();

    if (STOPWORDS.has(key)) continue;
    if (key.length < 3) continue;

    const prevTopic = topics[key];
    const wPrev = prevTopic?.w ?? 0;

    // incremento menor para evitar fijación excesiva
    const increment = role === "user" ? 0.06 : 0.03;
    const wNew = clamp01(wPrev + increment);

    const topic: AUHashTopic = {
      w: wNew,
      last: now,
      g: prevTopic?.g ?? []
    };

    topics[key] = topic;
  }

  return {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      topics
    }
  };
}

/* =========================================================
   Consulta dinámica con decaimiento temporal real
========================================================= */

export function queryMemory(
  state: AUHashState | null | undefined,
  topN: number = 6
) {
  const s = ensureState(state);
  const now = Date.now();

  const scored = Object.entries(s.memory.topics || {}).map(([k, v]) => {

    const ageSeconds = (now - v.last) / 1000;

    // decaimiento exponencial (media vida ~18s)
    const freshness = Math.exp(-ageSeconds / 18);

    const score = v.w * freshness;

    return {
      k,
      w: v.w,
      last: v.last,
      score,
      domain: inferDomain(k)
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN);
}

/* =========================================================
   Dominio semántico ligero (expandible)
========================================================= */

function inferDomain(token: string): string {
  const t = token.toLowerCase();

  if (["yo", "soy", "identidad", "quien"].includes(t))
    return "identidad";

  if (["recuerdo", "memoria", "pasado"].includes(t))
    return "memoria";

  if (["estructura", "sistema", "orden"].includes(t))
    return "estructura";

  if (["miedo", "gana", "hambre", "deseo"].includes(t))
    return "impulso";

  if (["platja", "muntanya", "playa", "montaña"].includes(t))
    return "lugar";

  if (["calamars", "comida", "menjar", "hambre"].includes(t))
    return "cuerpo";

  return "tema";
}

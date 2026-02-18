// lib/auhash/minimal.ts
import type {
  AUHashState,
  AUHashTopic,
  Lang,
  AUGlyph
} from "./kernel";

/* =========================================================
   Types
========================================================= */

export type MemoryHit = {
  key: string;
  token: string;
  domain: string;
  w: number;
  strength: number;
  phon: AUGlyph[];
};

/* =========================================================
   Utils
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
   Fonética AU (provisional)
========================================================= */

function phoneticAU(token: string): AUGlyph[] {
  return token.split("").map((c) => c.charCodeAt(0) % 9);
}

/* =========================================================
   Dominio semántico
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

  if (["avui", "hoy", "ahora"].includes(t))
    return "tiempo";

  if (["platja", "mercat", "casa"].includes(t))
    return "lugar";

  return "tema";
}

/* =========================================================
   Stopwords
========================================================= */

const STOPWORDS = new Set([
  "hola",
  "estas",
  "estás",
  "com",
  "como",
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
  if (prev?.memory) return prev;

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
      events: []
    }
  },
  frame: {
  level: "1e6"
}

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
  const topics = { ...s.memory.topics };

  const tokens = normalizeTokens(text);

  for (const raw of tokens.slice(0, 12)) {
    if (STOPWORDS.has(raw)) continue;
    if (raw.length < 3) continue;

    const prevTopic = topics[raw];

    const decay = prevTopic
      ? prevTopic.w * Math.exp(-(now - prevTopic.last) / 20000)
      : 0;

    const delta = role === "user" ? 0.08 : 0.04;
    const wNew = clamp01(decay + delta);

    const topic: AUHashTopic = {
      w: wNew,
      last: now,
      phon: prevTopic?.phon ?? phoneticAU(raw),
      domain: prevTopic?.domain ?? inferDomain(raw),
      g: prevTopic?.g ?? [],
      suspendedUntil: prevTopic?.suspendedUntil ?? 0
    };

    topics[raw] = topic;
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
   Query
========================================================= */

export function queryMemory(
  state: AUHashState | null | undefined,
  topN: number = 6
): MemoryHit[] {

  const s = ensureState(state);
  const now = Date.now();

  const entries = Object.entries(s.memory.topics || {})
    .filter(([_, v]) => v.suspendedUntil <= now);

  const total = entries.reduce((acc, [_, v]) => acc + v.w, 0) || 1;

  return entries
    .sort((a, b) => b[1].w - a[1].w)
    .slice(0, topN)
    .map(([k, v]) => ({
      key: k,
      token: k,
      domain: v.domain,
      w: v.w,
      strength: v.w / total,
      phon: v.phon
    }));
}

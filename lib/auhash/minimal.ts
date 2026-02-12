import type { AUHashState, AUHashTopic, Lang } from "./kernel";

/* =========================================================
   Types
========================================================= */

export type MemoryHit = {
  k: string;
  w: number;
  last: number;
  domain: string;
};

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

function phoneticAU(token: string): number[] {
  return token.split("").map((c) => c.charCodeAt(0) % 9);
}

function inferDomain(token: string): string {
  const t = token.toLowerCase();

  if (["yo", "soy", "identidad", "quien"].includes(t)) return "identidad";
  if (["recuerdo", "memoria", "pasado"].includes(t)) return "memoria";
  if (["estructura", "sistema", "orden"].includes(t)) return "estructura";
  if (["miedo", "gana", "hambre", "deseo"].includes(t)) return "impulso";
  if (["platja", "playa", "casa", "montaña", "muntanya"].includes(t)) return "lugar";
  if (["calamars", "hambre", "cuerpo"].includes(t)) return "cuerpo";

  return "tema";
}

/* =========================================================
   Estado base
========================================================= */

export function ensureState(prev?: AUHashState | null): AUHashState {
  if (prev && typeof prev === "object" && prev.memory) return prev;

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
        topHistory: []
      }
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

  if (!text?.trim()) {
    return { ...s, t: now };
  }

  const tokens = normalizeTokens(text);
  const topics = { ...s.memory.topics };

  for (const raw of tokens.slice(0, 12)) {

    if (raw.length < 3) continue;

    const key = raw;
    const prevTopic = topics[key];

    const wPrev = prevTopic?.w ?? 0;
    const delta = role === "user" ? 0.08 : 0.04;
    const wNew = clamp01(wPrev + delta);

    const topic: AUHashTopic = {
      w: wNew,
      last: now,
      g: prevTopic?.g ?? phoneticAU(key),
      phon: prevTopic?.phon ?? phoneticAU(key),
      domain: prevTopic?.domain ?? inferDomain(key)
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
   Consulta memoria
========================================================= */

export function queryMemory(
  state: AUHashState | null | undefined,
  topN: number = 6
): MemoryHit[] {

  const s = ensureState(state);

  const entries = Object.entries(s.memory.topics || {});

  entries.sort((a, b) => (b[1]?.w ?? 0) - (a[1]?.w ?? 0));

  return entries.slice(0, topN).map(([k, v]) => ({
    k,
    w: v.w,
    last: v.last,
    domain: v.domain
  }));
}

import type { AUHashState, Lang } from "./kernel";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function ensureState(prev: AUHashState | null | undefined): AUHashState {
  const now = Date.now();
  if (prev && typeof prev === "object" && prev.memory) return prev;
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

/**
 * ingestText:
 * - suma votos de idioma (simple)
 * - guarda "topics" por hash básico (sin ejemplos hardcoded)
 */
export function ingestText(
  prev: AUHashState | null | undefined,
  text: string,
  role: "user" | "assistant",
  langHint?: Lang
): AUHashState {
  const s = ensureState(prev);
  const now = Date.now();
  const t = (text || "").trim();
  if (!t) return { ...s, t: now };

  const lang: Lang = langHint || guessLang(t);
  const votes = { ...s.memory.langVotes };
  votes[lang] = (votes[lang] || 0) + (role === "user" ? 2 : 1);

  // topic hash básico por palabra “fuerte” (aquí aún simple; luego lo refinamos)
  const tokens = normalizeTokens(t);
  const topics = { ...s.memory.topics };

  for (const tok of tokens.slice(0, 12)) {
    const key = hashKey(tok);
    const prevTopic = topics[key];
    const wPrev = prevTopic?.w ?? 0;
    const wNew = clamp01(wPrev + (role === "user" ? 0.08 : 0.04));
    topics[key] = { w: wNew, last: now, g: prevTopic?.g };
  }

  return {
    ...s,
    t: now,
    memory: {
      topics,
      langVotes: votes
    }
  };
}

/** queryMemory: devuelve los topics más fuertes (para “recuerdo” implícito) */
export function queryMemory(state: AUHashState | null | undefined, topN = 8) {
  const s = ensureState(state);
  const entries = Object.entries(s.memory.topics || {});
  entries.sort((a, b) => (b[1]?.w ?? 0) - (a[1]?.w ?? 0));
  return entries.slice(0, topN).map(([k, v]) => ({ k, w: v.w, last: v.last }));
}

function guessLang(t: string): Lang {
  const low = t.toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(low) || /\b(per què|què|a on|m'ho)\b/.test(low)) return "ca";
  if (/[áéíóúñ¿¡]/.test(low) || /\b(qué|por qué|dónde|recuerda)\b/.test(low)) return "es";
  return "en";
}

function normalizeTokens(t: string) {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((x) => x.length >= 3);
}

function hashKey(s: string) {
  // hash determinista corto
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "T" + (h >>> 0).toString(16);
}

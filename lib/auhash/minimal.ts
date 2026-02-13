// lib/auhash/minimal.ts
import type { AUHashMemory, AUHashState, AUHashTopic, Lang } from "./kernel";

export type MemoryHit = {
  key: string;
  token: string;  // prestado (solo UX)
  domain: string;
  w: number;
  last: number;
  phon: number[];
  suspended: boolean;
  score: number; // score base (sin TOR)
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "T" + (h >>> 0).toString(16);
}

function normalizeTokens(t: string): string[] {
  return (t || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((x) => x.length >= 2);
}

/** transliteración fonética AU mínima (provisional, jerárquica) */
function phoneticAU(token: string): number[] {
  // Mapa simple y estable -> vector pequeño
  // (esto lo iremos refinando a niveles letra→sílabas→palabra)
  const t = token.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < Math.min(10, t.length); i++) {
    const c = t.charCodeAt(i);
    out.push((c % 31) + 1);
  }
  return out.length ? out : [0];
}

function guessLang(t: string): Lang {
  const low = (t || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(low) || /\b(per què|què|a on|m'ho)\b/.test(low)) return "ca";
  if (/[áéíóúñ¿¡]/.test(low) || /\b(qué|por qué|dónde|recuerda)\b/.test(low)) return "es";
  return "en";
}

function inferDomain(token: string): string {
  const t = token.toLowerCase();

  // identidad / memoria / estructura / impulso / lugar / cuerpo / tiempo (expandible)
  if (["yo", "soy", "identidad", "quien", "quién", "self"].includes(t)) return "identidad";
  if (["recuerdo", "memoria", "pasado", "recordar"].includes(t)) return "memoria";
  if (["estructura", "sistema", "orden", "regla"].includes(t)) return "estructura";
  if (["miedo", "gana", "hambre", "deseo", "ansiedad"].includes(t)) return "impulso";
  if (["casa", "hogar", "mercat", "mercado", "platja", "playa", "muntanya", "montaña"].includes(t)) return "lugar";
  if (["calamars", "calamares", "menjar", "comer", "cuerpo", "dolor"].includes(t)) return "cuerpo";
  if (["avui", "hoy", "demà", "mañana", "ayer"].includes(t)) return "tiempo";

  return "tema";
}

export function ensureState(prev?: AUHashState | null): AUHashState {
  const now = Date.now();
  if (prev && typeof prev === "object" && prev.memory && prev.v === 2) return prev;

  const memory: AUHashMemory = {
    topics: {},
    langVotes: { es: 0, ca: 0, en: 0 },
    meta: {
      stuckCount: 0,
      lastPickedKey: null,
      topHistory: [],
      events: []
    }
  };

  return {
    v: 2,
    t0: now,
    t: now,
    memory
  };
}

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

  // votos de idioma (leve)
  const lang = langHint || guessLang(trimmed);
  const lv = { ...s.memory.langVotes };
  lv[lang] = (lv[lang] || 0) + (role === "user" ? 2 : 1);

  // tokens
  const toks = normalizeTokens(trimmed);
  const topics: Record<string, AUHashTopic> = { ...s.memory.topics };

  // delta base (no decide nada “político”)
  const delta = role === "user" ? 0.08 : 0.04;

  for (const token of toks.slice(0, 14)) {
    const key = hashKey(token);
    const prevTopic = topics[key];
    const wPrev = prevTopic?.w ?? 0;

    // subida suave
    const wNew = clamp01(wPrev + delta);

    topics[key] = {
      w: wNew,
      last: now,
      domain: prevTopic?.domain ?? inferDomain(token),
      phon: prevTopic?.phon ?? phoneticAU(token),
      g: prevTopic?.g ?? [],
      suspendedUntil: prevTopic?.suspendedUntil ?? 0
    };
  }

  return {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      langVotes: lv,
      topics
    }
  };
}

export function queryMemory(state: AUHashState | null | undefined, topN: number = 10): MemoryHit[] {
  const s = ensureState(state);
  const now = Date.now();

  // Convertimos topics->hits (sin depender del “token literal” persistido)
  // token aquí será “prestado”: usamos key como fallback si no tenemos token.
  const hits: MemoryHit[] = Object.entries(s.memory.topics || {}).map(([key, topic]) => {
    const suspended = topic.suspendedUntil > now;

    // score base: peso + recencia (leve) - suspensión
    const age = Math.max(0, now - (topic.last || now));
    const rec = 1 / (1 + age / 45000); // ~45s
    const base = clamp01(0.75 * topic.w + 0.25 * rec);
    const score = suspended ? base * 0.05 : base;

    return {
      key,
      token: key, // prestado (UI/engine puede reemplazar con token actual si lo tiene)
      domain: topic.domain,
      w: topic.w,
      last: topic.last,
      phon: topic.phon,
      suspended,
      score
    };
  });

  hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return hits.slice(0, topN);
}

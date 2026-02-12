// lib/auhash/minimal.ts
import type { AUHashState, Lang } from "./kernel";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function ensureState(prev?: AUHashState | null): AUHashState {
  const now = Date.now();
  if (prev && typeof prev === "object" && (prev as any).memory) return prev;
  return {
    v: 1,
    t0: now,
    t: now,
    memory: {
      topics: {},
      langVotes: { es: 0, ca: 0, en: 0 },
    },
  };
}

/**
 * Dominio humano (muy simple) para dejar de responder hashes.
 * Paso 2 lo refinamos con AU-signals y jerarquía.
 */
function detectDomain(token: string): string {
  const t = token.toLowerCase();

  // Identidad / persona
  if (["yo", "mi", "mío", "mio", "soy", "ser", "persona", "identidad"].includes(t)) return "identidad";

  // Movimiento / lugar
  if (["playa", "viaje", "ir", "venir", "camino", "lugar", "casa", "barcelona"].includes(t)) return "movimiento";

  // Orden / disciplina
  if (["disciplina", "orden", "rutina", "control", "límite", "limite", "norma"].includes(t)) return "estructura";

  // Riesgo / ruptura
  if (["miedo", "riesgo", "romper", "ruptura", "crisis", "peligro"].includes(t)) return "riesgo";

  // Memoria / recordar
  if (["recuerda", "recordar", "olvida", "olvidar", "memoria", "hilo"].includes(t)) return "memoria";

  // Lenguaje / símbolo
  if (["número", "numero", "letra", "símbolo", "simbolo", "hash", "kernel", "route", "pages"].includes(t)) return "lenguaje";

  return "tema";
}

/**
 * ingestText:
 * - suma votos de idioma
 * - aprende tokens -> topics con dominio humano
 * - evita responder hashes crudos
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

  const tokens = normalizeTokens(t);
  const topics = { ...s.memory.topics };

  for (const tok of tokens.slice(0, 12)) {
    const key = hashKey(tok);
    const prevTopic = topics[key];
    const wPrev = prevTopic?.w ?? 0;

    const wNew = clamp01(wPrev + (role === "user" ? 0.08 : 0.04));
    const domain = detectDomain(tok);

    // Importante: no guardamos g si no existe (evita líos con TS)
    topics[key] = {
      w: wNew,
      last: now,
      token: tok,
      domain,
      ...(prevTopic?.g ? { g: prevTopic.g } : {}),
    };
  }

  return {
    ...s,
    t: now,
    memory: {
      topics,
      langVotes: votes,
    },
  };
}

export type MemoryHit = {
  key: string;
  token: string;   // palabra humana
  domain: string;  // dominio humano
  w: number;
  last: number;
};

/** queryMemory: devuelve los topics más fuertes en modo humano */
export function queryMemory(state: AUHashState | null | undefined, topN = 8): MemoryHit[] {
  const s = ensureState(state);
  const entries = Object.entries(s.memory.topics || {});

  entries.sort((a, b) => (b[1]?.w ?? 0) - (a[1]?.w ?? 0));

  return entries.slice(0, topN).map(([key, v]) => ({
    key,
    token: v.token || key,           // fallback por si falta token
    domain: v.domain || "tema",
    w: v.w,
    last: v.last,
  }));
}

function guessLang(t: string): Lang {
  const low = t.toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(low) || /\b(per què|què|a on|m'ho)\b/.test(low)) return "ca";
  if (/[áéíóúñ¿¡]/.test(low) || /\b(qué|por qué|dónde|recuerda)\b/.test(low)) return "es";
  return "en";
}

function normalizeTokens(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((x) => x.length >= 3);
}

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return "T" + (h >>> 0).toString(16);
}

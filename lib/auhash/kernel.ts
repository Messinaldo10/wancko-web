/* =========================================================
 * AU_HASH KERNEL
 * Núcleo abstracto – sin hardcodes semánticos
 * ========================================================= */

/* ---------- Tipos base ---------- */

export type Role = "user" | "assistant";
export type Domain =
  | "PLACE"
  | "ENTITY"
  | "ACTION"
  | "TIME"
  | "VALUE"
  | "SELF"
  | "OTHER"
  | "SYSTEM"
  | "UNKNOWN";

export type Intent =
  | "retrieve"
  | "update"
  | "compare"
  | "decide"
  | "explain"
  | "explore"
  | "none";

export type MirrorHint = "direct" | "mirror" | "both";

/* ---------- Glifos ---------- */

export interface Glyph {
  level: 0 | 1 | 2 | 3 | 4;          // G0–G4
  domain: Domain;
  polarity: -1 | 0 | 1;              // NOK / neutral / OK
  weight: number;                    // relativo, no absoluto
  formHint?: string;                 // para color/forma (no literal)
}

/* ---------- Lengua / estado ---------- */

export interface LanguageState {
  primary: string;                   // "es", "ca", "en", etc.
  confidence: number;                // 0..1
  inertia: number;                   // estabilidad del idioma
}

/* ---------- Métricas AU ---------- */

export interface Metrics {
  phi: number;                       // desfase coherencia
  complexity: number;                // entrópica (cantidad)
  beauty: number;                    // neguentrópica (orden)
}

/* ---------- Memoria implícita ---------- */

export interface TopicMemory {
  domain: Domain;
  weight: number;
  age: number;
}

export interface MemoryState {
  topics: TopicMemory[];
  constraints: Domain[];             // incompatibilidades activas
}

/* ---------- AU_HASH compuesto ---------- */

export interface AUHash {
  D1: number[];  // espaciotiempo (numérico)
  D2: any[];     // lengua (no-numérico)
  D3: any[];     // símbolos (num = no-num)
  D4: any[];     // señales (num ≠ no-num)
}

/* ---------- Estado completo ---------- */

export interface AUState {
  hash: AUHash;
  memory: MemoryState;
  language: LanguageState;
  metrics: Metrics;
}

/* =========================================================
 * 1) extractGlyphs
 * ========================================================= */

export function extractGlyphs(text: string, langHint?: string) {
  const cleaned = text.trim();

  const isQuestion = /\?$/.test(cleaned);

  const glyphs: Glyph[] = [];

  // Glifo base: existencia de enunciado
  glyphs.push({
    level: 1,
    domain: "SYSTEM",
    polarity: 0,
    weight: 1
  });

  // Pregunta activa operador (no respuesta cerrada)
  if (isQuestion) {
    glyphs.push({
      level: 1,
      domain: "SYSTEM",
      polarity: 0,
      weight: 0.8,
      formHint: "interrogative"
    });
  }

  return {
    glyphs,
    languageDelta: {
      primary: langHint || "und",
      confidence: 0.1,
      inertia: 0.05
    }
  };
}

/* =========================================================
 * 2) updateAUHash
 * ========================================================= */

export function updateAUHash(
  prev: AUState | null,
  glyphs: Glyph[],
  role: Role
): AUState {
  const base: AUState = prev || {
    hash: { D1: [], D2: [], D3: [], D4: [] },
    memory: { topics: [], constraints: [] },
    language: { primary: "und", confidence: 0, inertia: 0 },
    metrics: { phi: 1, complexity: 0, beauty: 0 }
  };

  // --- Métricas ---
  const complexity = base.metrics.complexity + glyphs.length * 0.1;
  const beauty = Math.max(
    0,
    base.metrics.beauty +
      (glyphs.length > 1 ? 0.05 : -0.02)
  );

  const phi = Math.abs(complexity - beauty);

  // --- Lengua ---
  const language = {
    ...base.language,
    inertia: Math.min(1, base.language.inertia + 0.02)
  };

  // --- Memoria por dominios ---
  const topics = [...base.memory.topics];
  glyphs.forEach((g) => {
    if (!topics.find((t) => t.domain === g.domain)) {
      topics.push({ domain: g.domain, weight: g.weight, age: 0 });
    }
  });

  return {
    hash: base.hash,
    memory: {
      topics,
      constraints: base.memory.constraints
    },
    language,
    metrics: { phi, complexity, beauty }
  };
}

/* =========================================================
 * 3) resolveQuery
 * ========================================================= */

export function resolveQuery(text: string): {
  domain: Domain;
  intent: Intent;
  mirror: MirrorHint;
} {
  const t = text.toLowerCase();

  if (/\b(donde|on|where)\b/.test(t)) {
    return { domain: "PLACE", intent: "retrieve", mirror: "direct" };
  }

  if (/\b(qu[eé]|what)\b/.test(t)) {
    return { domain: "SYSTEM", intent: "explain", mirror: "both" };
  }

  return { domain: "UNKNOWN", intent: "none", mirror: "direct" };
}

/* =========================================================
 * 4) retrieve
 * ========================================================= */

export function retrieve(
  state: AUState,
  domain: Domain
): {
  found: boolean;
  confidence: number;
} {
  const topic = state.memory.topics.find((t) => t.domain === domain);

  if (!topic) {
    return { found: false, confidence: 0 };
  }

  return {
    found: true,
    confidence: Math.min(1, topic.weight)
  };
}

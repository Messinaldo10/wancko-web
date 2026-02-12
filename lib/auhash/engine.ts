import type { MemoryHit } from "./minimal";

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* =========================================================
   Compute AU Signals
========================================================= */

export function computeAU(hits: MemoryHit[], turns: number) {
  if (!hits || hits.length === 0) {
    return {
      signals: {
        d: 0.5,
        W: 0.5,
        band: 1,
        ok: 0.5,
        tone: "amber",
        complexity: 0.2,
        beauty: 0.4
      }
    };
  }

  const top = hits[0];

  // 🔹 usar w en vez de strength
  const sum = hits.reduce((acc, h) => acc + (h.w || 0), 0) || 1;
  const dominance = clamp01((top.w || 0) / sum);

  // 🔹 complejidad crece con número de hits + turns
  const complexity = clamp01(Math.log2(1 + hits.length + turns) / 5);

  // 🔹 belleza = equilibrio (menos dominancia = más belleza)
  const beauty = clamp01(1 - dominance * 0.8);

  // 🔹 coherencia directa
  const d = clamp01(dominance);

  // 🔹 tono según dominio dominante
  let tone: "green" | "red" | "amber";

  if (top.domain === "identidad" || top.domain === "memoria") {
    tone = "red";
  } else if (top.domain === "estructura") {
    tone = "green";
  } else {
    tone = "amber";
  }

  return {
    signals: {
      d,
      W: beauty,
      band: Math.min(5, Math.floor(complexity * 5) + 1),
      ok: beauty,
      tone,
      complexity,
      beauty
    }
  };
}

/* =========================================================
   Format hit
========================================================= */

export function formatHit(lang: string, hit: MemoryHit): string {
  if (lang === "ca") return `${hit.k} (domini: ${hit.domain})`;
  if (lang === "en") return `${hit.k} (domain: ${hit.domain})`;
  return `${hit.k} (dominio: ${hit.domain})`;
}

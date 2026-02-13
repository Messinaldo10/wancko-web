// lib/auhash/engine.ts
import type { Lang } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* =========================================================
   Compute AU state (color, dominance, complexity)
========================================================= */

export function computeAU(
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  turns: number,
  silenceCount: number,
  lang: Lang
) {

  if (!hits.length) {
    return {
      tone: "neutral",
      dominance: 0,
      complexity: 0,
      entropy: 0
    };
  }

  const top = hits[0];

  const sum = hits.reduce((acc, h) => acc + (h.w || 0), 0) || 1;

  const dominance = clamp01((top.w || 0) / sum);

  const complexity = clamp01(hits.length / 10);

  const entropy = clamp01(silenceCount / (turns || 1));

  let tone = "day";

  if (top.domain === "identidad" || top.domain === "memoria") tone = "night";
  if (top.domain === "estructura") tone = "violet";
  if (top.domain === "impulso") tone = "amber";

  return {
    tone,
    dominance,
    complexity,
    entropy,
    top
  };
}

/* =========================================================
   Format human hit
========================================================= */

export function formatHit(lang: Lang, hit: MemoryHit): string {
  if (lang === "ca") return `${hit.token} (domini: ${hit.domain})`;
  if (lang === "en") return `${hit.token} (domain: ${hit.domain})`;
  return `${hit.token} (dominio: ${hit.domain})`;
}

// lib/auhash/engine.ts
import type { Lang } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* =========================================================
   Format
========================================================= */

export function formatHit(lang: Lang, hit: MemoryHit): string {
  if (lang === "ca") return `${hit.token} (domini: ${hit.domain})`;
  if (lang === "en") return `${hit.token} (domain: ${hit.domain})`;
  return `${hit.token} (dominio: ${hit.domain})`;
}

/* =========================================================
   Coherence line (visual / log)
========================================================= */

export function coherenceLine(
  lang: Lang,
  hit: MemoryHit | null
): string {
  if (!hit) return "—";
  return formatHit(lang, hit);
}

/* =========================================================
   Compute AU (sin decision)
========================================================= */

export function computeAU(
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  turns: number,
  silenceCount: number,
  lang: Lang
) {
  const top = hits[0] ?? null;

  /* ---------------- Dominancia ---------------- */

  const sum =
    hits.slice(0, 6).reduce((acc, h) => acc + (h.w ?? 0), 0) || 1;

  const dominance =
    top ? clamp01((top.w ?? 0) / sum) : 0;

  /* ---------------- Decidibilidad ---------------- */

  const silencePenalty =
    clamp01((silenceCount || 0) / Math.max(1, turns || 1));

  const d =
    clamp01(0.18 + dominance * 0.70 - silencePenalty * 0.35);

  /* ---------------- W (razón ↔ verdad) ---------------- */

  const W =
    clamp01(0.45 + dominance * 0.30 - silencePenalty * 0.15);

  /* ---------------- Derivados dinámicos ---------------- */

  const complexity =
    clamp01(Math.log2(2 + turns) / 6);

  const beauty =
    clamp01(0.50 + (d - 0.5) * 0.25);

  /* ---------------- Tono ---------------- */

  let tone:
    | "green"
    | "amber"
    | "red"
    | "day"
    | "violet"
    | "night" = "amber";

  if (mode === "wancko") {
    tone =
      d > 0.62 ? "green"
      : d < 0.35 ? "red"
      : "amber";
  } else {
    const dom = top?.domain || "tema";

    if (dom === "memoria" || dom === "identidad")
      tone = "night";
    else if (d < 0.40)
      tone = "night";
    else if (d < 0.62)
      tone = "violet";
    else
      tone = "day";
  }

  /* ---------------- Otros indicadores ---------------- */

  const ok =
    clamp01(0.50 + (turns - silenceCount) * 0.02);

  const band =
    d > 0.66 ? 3
    : d > 0.45 ? 2
    : 1;

  /* ---------------- Return limpio ---------------- */

  return {
    mode,
    screen: mode === "wancko" ? "natural" : "mirror",
    matrix: "AU",
    N_level: turns,
    signals: {
      d,
      W,
      band,
      ok,
      tone,
      complexity,
      beauty,
    },
    explain: {
      top,
      dominance,
      silencePenalty,
      lang,
    },
  };
}

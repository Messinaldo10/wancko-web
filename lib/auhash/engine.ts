// lib/auhash/engine.ts
import type { Lang } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function formatHit(lang: Lang, hit: MemoryHit): string {
  if (lang === "ca") return `${hit.token} (domini: ${hit.domain})`;
  if (lang === "en") return `${hit.token} (domain: ${hit.domain})`;
  return `${hit.token} (dominio: ${hit.domain})`;
}

/** Línea “coherencia” para texto corto (si lo quieres en UI o logs) */
export function coherenceLine(lang: Lang, hit: MemoryHit | null, anti?: string | null): string {
  if (anti === "silence") {
    return lang === "ca"
      ? "— (pausa)"
      : lang === "en"
      ? "— (pause)"
      : "— (pausa)";
  }
  if (!hit) return "—";
  return formatHit(lang, hit);
}

type DecisionLike = {
  pick?: MemoryHit | null;
  anti?: null | "silence" | "break";
  reason?: string;
};

export function computeAU(
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  turns: number,
  silenceCount: number,
  decision?: DecisionLike,
  lang?: Lang
) {
  const top = (decision?.pick ?? hits[0] ?? null) as MemoryHit | null;

  // Dominancia y “d” (decidibilidad)
  const sum = hits.slice(0, 6).reduce((acc, h) => acc + (h.w || 0), 0) || 1;
  const dominance = top ? clamp01((top.w || 0) / sum) : 0;

  // decidibilidad (d): sube si hay dominancia, baja con silencios
  const silencePenalty = clamp01((silenceCount || 0) / Math.max(1, turns || 1));
  const d = clamp01(0.18 + dominance * 0.70 - silencePenalty * 0.35);

  // W: razón ↔ verdad (más centrado)
  const W = clamp01(0.45 + dominance * 0.30 - silencePenalty * 0.15);

  // complejidad/belleza derivadas (no hardcode fijo)
  const complexity = clamp01(Math.log2(2 + turns) / 6);          // 0..~1
  const beauty = clamp01(0.50 + (d - 0.5) * 0.25);              // responde a dinámica

  // tono
  let tone: "green" | "amber" | "red" | "day" | "violet" | "night" = "amber";

  if (mode === "wancko") {
    tone = d > 0.62 ? "green" : d < 0.35 ? "red" : "amber";
  } else {
    // H-Wancko: más “luz” en función del dominio y d
    const dom = top?.domain || "tema";
    if (dom === "memoria" || dom === "identidad") tone = "night";
    else if (d < 0.40) tone = "night";
    else if (d < 0.62) tone = "violet";
    else tone = "day";
  }

  const ok = clamp01(0.50 + (turns - silenceCount) * 0.02);
  const band = d > 0.66 ? 3 : d > 0.45 ? 2 : 1;

  return {
    mode,
    screen: mode === "wancko" ? "natural" : "mirror",
    matrix: "AU",
    N_level: turns,
    anti: decision?.anti ?? null,
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
      reason: decision?.reason ?? "none",
    },
  };
}

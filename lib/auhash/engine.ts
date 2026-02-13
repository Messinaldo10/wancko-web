// lib/auhash/engine.ts
import type { Lang } from "./kernel";
import type { MemoryHit } from "./minimal";
import type { TorDecision } from "./tor";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function coherenceLine(lang: Lang, reason: string): string {
  if (lang === "ca") return `coherència: ${reason}`;
  if (lang === "en") return `coherence: ${reason}`;
  return `coherencia: ${reason}`;
}

export function formatHit(lang: Lang, hit: MemoryHit): string {
  // token es “prestado”; mostramos dominio porque eso sí es estructura
  const tok = hit.token || hit.key;
  if (lang === "ca") return `${tok} (domini: ${hit.domain})`;
  if (lang === "en") return `${tok} (domain: ${hit.domain})`;
  return `${tok} (dominio: ${hit.domain})`;
}

export type AUEnvelope = {
  mode: "wancko" | "hwancko";
  screen: "natural";
  matrix: "AU";
  N_level: number;
  anti: null | "silence" | "break";
  signals: {
    d: number;            // gradiente
    W: number;            // reason↔truth
    band: number;         // banda discreta
    ok: number;           // ok_live
    tone: "green" | "amber" | "red" | "day" | "violet" | "night";
    complexity: number;
    beauty: number;
    sense?: "direct" | "inverse";
  };
  explain: {
    entropy: number;
    coherence: number;
    hold: boolean;
    top: MemoryHit | null;
    reason: string;
  };
};

export function computeAU(
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  turns: number,
  silenceCount: number,
  decision: TorDecision,
  lang: Lang
): AUEnvelope {
  const top = decision.pick || hits[0] || null;

  // d: mezcla coherencia + (1-entropía) con sesgo a “legibilidad”
  const d = clamp01(decision.coherence * 0.62 + (1 - decision.entropy) * 0.38);

  // W: si hold (proteger) => W baja un poco (más prudencia), si release => sube
  const W = clamp01(0.5 + (decision.hold ? -0.08 : 0.10) + (d - 0.5) * 0.35);

  // ok_live: aumenta con turnos útiles (turns - silence)
  const ok = clamp01(0.5 + (turns - silenceCount) * 0.02);

  // band: discretización
  const band = d > 0.66 ? 3 : d < 0.38 ? 1 : 2;

  // tone: derivado de modo + dominio + hold/release
  let tone: AUEnvelope["signals"]["tone"] = "amber";

  if (mode === "wancko") {
    // Wancko: verde si release con coherencia alta, rojo si caos y hold duro
    if (!decision.hold && d > 0.62) tone = "green";
    else if (decision.hold && decision.entropy > 0.70) tone = "red";
    else tone = "amber";
  } else {
    // H-Wancko: día/violeta/noche según dominio y hold
    const dom = top?.domain || "tema";
    if (decision.hold && (dom === "identidad" || dom === "memoria")) tone = "night";
    else if (dom === "estructura") tone = "violet";
    else tone = "day";
  }

  const complexity = clamp01(decision.complexity);
  const beauty = clamp01(decision.beauty);

  return {
    mode,
    screen: "natural",
    matrix: "AU",
    N_level: turns,
    anti: decision.anti,
    signals: {
      d,
      W,
      band,
      ok,
      tone,
      complexity,
      beauty,
      sense: mode === "hwancko" ? "inverse" : "direct"
    },
    explain: {
      entropy: decision.entropy,
      coherence: decision.coherence,
      hold: decision.hold,
      top,
      reason: coherenceLine(lang, decision.reason)
    }
  };
}

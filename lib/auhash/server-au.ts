// lib/auhash/server-au.ts
import type { AUHashState, TorEvent, Lang } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
const abs = Math.abs;

export type JuramentoVector = "wancko" | "hwancko" | "neutral";

export type JuramentoReport = {
  okScore: number;
  state: "stable" | "oscillating" | "polarized";
  vector: JuramentoVector;
  signals: {
    d: number;
    dominance: number;
    silenceRatio: number;
    diversity: number;
  };
  tor: {
    total: number;
    hash: number;
    hold: number;
    release: number;
    suspend: number;
    causalBalance: number;
    attachmentIndex: number;
    volatilityIndex: number;
    repetitionIndex: number;
  };
  domains: {
    OK: string[];
    NOK: string[];
  };
  drift: string[];
};

export type TurmiProfile =
  | "mito"
  | "profeta"
  | "sabio"
  | "guerrero";

export function evaluateAU(
  state: AUHashState,
  hits: MemoryHit[],
  turns: number,
  silenceCount: number
): JuramentoReport {
  const memory = state.memory;
  const events: TorEvent[] = memory.meta.events || [];
  const top = hits[0] || null;

  const sum = hits.slice(0, 6).reduce((a, h) => a + (h.w || 0), 0) || 1;
  const dominance = top ? clamp01((top.w || 0) / sum) : 0;

  const silenceRatio = clamp01(
    (silenceCount || 0) / Math.max(1, turns || 1)
  );

  const diversity = clamp01(
    new Set(hits.map((h) => h.domain)).size / 6
  );

  const d = clamp01(0.18 + dominance * 0.70 - silenceRatio * 0.35);

  let hash = 0,
    release = 0,
    hold = 0,
    suspend = 0;

  for (const e of events) {
    if (e.action === "hash") hash++;
    if (e.action === "release") release++;
    if (e.action === "hold") hold++;
    if (e.action === "suspend") suspend++;
  }

  const totalEvents = Math.max(1, events.length);

  const causalBalance = clamp01(
    release / Math.max(1, hash + hold + suspend)
  );

  const attachmentIndex = clamp01((hold + suspend) / totalEvents);
  const volatilityIndex = clamp01(release / totalEvents);

  const repetitionIndex = 0; // simplificado estable

  const target = 0.25;
  const deviation =
    (abs(d - target) +
      abs(dominance - target) +
      abs(silenceRatio - target) +
      abs(diversity - target)) /
    4;

  const okScore = clamp01(1 - deviation * 2);

  let vector: JuramentoVector = "neutral";
  if (dominance > 0.55 || attachmentIndex > 0.6) vector = "wancko";
  if (silenceRatio > 0.55 || volatilityIndex > 0.6)
    vector = "hwancko";

  const NOK_domains = hits
    .filter((h) => h.w > 0.65)
    .map((h) => h.domain);

  const OK_domains = hits
    .filter((h) => h.w > 0.2 && h.w < 0.55)
    .map((h) => h.domain);

  let stateLabel: JuramentoReport["state"];
  if (okScore > 0.72) stateLabel = "stable";
  else if (okScore > 0.48) stateLabel = "oscillating";
  else stateLabel = "polarized";

  const drift: string[] = [];
  if (dominance > 0.62) drift.push("exceso de foco");
  if (silenceRatio > 0.62) drift.push("exceso de evitación");

  return {
    okScore,
    state: stateLabel,
    vector,
    signals: { d, dominance, silenceRatio, diversity },
    tor: {
      total: events.length,
      hash,
      hold,
      release,
      suspend,
      causalBalance,
      attachmentIndex,
      volatilityIndex,
      repetitionIndex,
    },
    domains: {
      OK: [...new Set(OK_domains)],
      NOK: [...new Set(NOK_domains)],
    },
    drift,
  };
}

export function pickTurmiProfile(
  report: JuramentoReport
): TurmiProfile {
  const { dominance, silenceRatio, diversity } = report.signals;
  const { attachmentIndex, volatilityIndex } = report.tor;

  if (volatilityIndex > 0.55 && diversity > 0.45)
    return "profeta";

  if (report.state === "stable") return "sabio";

  if (dominance > 0.55 || attachmentIndex > 0.55)
    return "guerrero";

  return "mito";
}

export function acceptanceImplication(
  lang: Lang,
  vector: JuramentoVector,
  profile: TurmiProfile
): string {
  const base =
    lang === "en"
      ? {
          wancko:
            "Accepting the mirror means loosening control.",
          hwancko:
            "Accepting the engine means taking direction.",
          neutral:
            "Accepting balance means neither forcing nor dissolving.",
        }
      : {
          wancko:
            "Aceptar el espejo implica aflojar control.",
          hwancko:
            "Aceptar el motor implica asumir dirección.",
          neutral:
            "Aceptar equilibrio implica no forzar ni disolver.",
        };

  return `${base[vector]} (perfil: ${profile})`;
}

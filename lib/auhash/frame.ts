// lib/auhash/frame.ts
import type { JuramentoReport, JuramentoVector } from "./server-au";
import { primaryMetricsFromKey } from "./mod999999";

/* =========================================================
   Types
========================================================= */

import type { EntropicLevel } from "./kernel";
export type AUFrameLevel = EntropicLevel;
export type AUFramePerm = "1234" | "2143" | "3412" | "4321";
export type AUFrameRole = "A" | "C" | "V" | "R";

export type AUFrame = {
  level: AUFrameLevel;
  perm: AUFramePerm;
  permShifted: boolean;
  inside: AUFrameRole[];
  outside: AUFrameRole[];
  vector: Record<AUFrameRole, number>; // 0..1
  reason: string;
};

export type AUFrameOps = {
  entanglement: number;
  curvature: number;
  duality: number;
  noise: number;
  resonance: number;
  derivatives: {
    d1: number;
    W1: number;
    attach1: number;
  };
};

export type AUFrameMetrics = {
  dimensional_distance: number;
  polarity_gap: number;
  cycle_conflict: number;
};

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function mean(xs: number[]) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]) {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) * (x - m)));
  return Math.sqrt(v);
}

function inferLevel(turns: number): AUFrameLevel {
  if (turns <= 12) return "1e6";
  if (turns <= 60) return "1e12";
  if (turns <= 240) return "1e18";
  return "1e36";
}

function choosePerm(
  vector: Record<AUFrameRole, number>,
  vecDir: JuramentoVector,
  okScore: number,
  silenceRatio: number,
  dominance: number
): { perm: AUFramePerm; reason: string } {
  if (okScore > 0.72 && silenceRatio < 0.35 && dominance < 0.55) {
    return { perm: "1234", reason: "estable: A→C→V→R (flujo natural)" };
  }
  if (vecDir === "wancko" || vector.C > 0.62 || dominance > 0.62) {
    return { perm: "2143", reason: "deriva a control: C→A→R→V (límite primero)" };
  }
  if (vecDir === "hwancko" || silenceRatio > 0.55 || vector.V > 0.62) {
    return { perm: "3412", reason: "deriva a espejo/valores: V→R→A→C" };
  }
  if (okScore < 0.48 || vector.R > 0.70) {
    return { perm: "4321", reason: "polarizado: R→V→C→A (certificación manda)" };
  }
  return { perm: "1234", reason: "default: A→C→V→R" };
}

function inferInsideOutside(
  entanglement: number,
  vector: Record<AUFrameRole, number>
): { inside: AUFrameRole[]; outside: AUFrameRole[]; reason: string } {
  const roles: AUFrameRole[] = ["A", "C", "V", "R"];

  if (entanglement > 0.55) {
    return {
      inside: [],
      outside: roles,
      reason: "alta combinación A/C/V/R => fuera del marco (cross-frame)",
    };
  }

  let best: AUFrameRole = "A";
  let bestV = -1;
  for (const r of roles) {
    const v = vector[r] ?? 0;
    if (v > bestV) {
      bestV = v;
      best = r;
    }
  }

  return {
    inside: [best],
    outside: roles.filter((r) => r !== best),
    reason: `baja combinación => marco local dominante: ${best}`,
  };
}

function levelToIndex(level: AUFrameLevel): number {
  switch (level) {
    case "1e6": return 0;
    case "1e12": return 1;
    case "1e18": return 2;
    case "1e36": return 3;
    default: return 0;
  }
}

/* =========================================================
   computeFrameAndOps
========================================================= */

export function computeFrameAndOps(args: {
  wReport?: JuramentoReport | null;
  hReport?: JuramentoReport | null;
  wTurns: number;
  hTurns: number;
  // para métricas primarias: le pasas key (top hit) desde route/juramento
  wTopKey?: string | null;
  hTopKey?: string | null;
}): { frame: AUFrame; ops: AUFrameOps; metrics: AUFrameMetrics } {

  const wTurns = args.wTurns || 0;
  const hTurns = args.hTurns || 0;
  const turns = Math.max(wTurns, hTurns);
  const level = inferLevel(turns);

  const wR = args.wReport;
  const hR = args.hReport;

  // agregados base
  const d = clamp01(mean([wR?.signals.d ?? 0, hR?.signals.d ?? 0]));
  const dominance = clamp01(mean([wR?.signals.dominance ?? 0, hR?.signals.dominance ?? 0]));
  const silenceRatio = clamp01(mean([wR?.signals.silenceRatio ?? 0, hR?.signals.silenceRatio ?? 0]));
  const diversity = clamp01(mean([wR?.signals.diversity ?? 0, hR?.signals.diversity ?? 0]));

  const attachment = clamp01(mean([wR?.tor.attachmentIndex ?? 0, hR?.tor.attachmentIndex ?? 0]));
  const repetition = clamp01(mean([wR?.tor.repetitionIndex ?? 0, hR?.tor.repetitionIndex ?? 0]));
  const volatility = clamp01(mean([wR?.tor.volatilityIndex ?? 0, hR?.tor.volatilityIndex ?? 0]));
  const okScore = clamp01(mean([wR?.okScore ?? 0, hR?.okScore ?? 0]));
  const causalBalance = clamp01(mean([wR?.tor.causalBalance ?? 0, hR?.tor.causalBalance ?? 0]));

  const vector: Record<AUFrameRole, number> = {
    A: d,
    C: clamp01(0.55 * dominance + 0.45 * attachment),
    V: clamp01(0.60 * diversity + 0.40 * (1 - repetition)),
    R: okScore,
  };

  // Ops
  const entanglement = clamp01(1 - std([vector.A, vector.C, vector.V, vector.R]) * 1.6);
  const curvature = clamp01(0.55 * repetition + 0.25 * volatility + 0.20 * (1 - okScore));

  const levelIndex = levelToIndex(level);
const levelBias = levelIndex / 3; // 0..1 normalizado

  const microExtremes = clamp01(Math.max(dominance, silenceRatio));
  const duality = clamp01(0.65 * Math.abs(levelBias - microExtremes) + 0.35 * Math.abs(d - okScore));

  const noise = clamp01(0.70 * volatility + 0.30 * (1 - causalBalance));
  const resonance = clamp01(1 - std([d, okScore, diversity, 1 - silenceRatio]) * 1.4);

  const d1 = clamp01((d - 0.5) * 0.5 + (1 - silenceRatio) * 0.15) - 0.5;
  const W1 = clamp01((okScore - 0.5) * 0.5 + (diversity - 0.3) * 0.2) - 0.5;
  const attach1 = clamp01((attachment - 0.5) * 0.6 - volatility * 0.2) - 0.5;

  // vecDir
  const vecDir: JuramentoVector =
    dominance > 0.55 || attachment > 0.60
      ? "wancko"
      : silenceRatio > 0.55 || volatility > 0.60
      ? "hwancko"
      : "neutral";

  // perm base
  const { perm, reason: permReason } = choosePerm(vector, vecDir, okScore, silenceRatio, dominance);

  // metrics primarias (si hay keys)
  const wKey = args.wTopKey || "";
  const hKey = args.hTopKey || "";

  const wm = wKey ? primaryMetricsFromKey(wKey) : null;
  const hm = hKey ? primaryMetricsFromKey(hKey) : null;

  const dimensional_distance = clamp01(mean([wm?.dimensional_distance ?? 0, hm?.dimensional_distance ?? 0]));
  const polarity_gap = clamp01(mean([wm?.polarity_gap ?? 0, hm?.polarity_gap ?? 0]));
  const cycle_conflict = clamp01(mean([wm?.cycle_conflict ?? 0, hm?.cycle_conflict ?? 0]));

  // perm shift si hay conflicto
  let dynamicPerm: AUFramePerm = perm;
  if (cycle_conflict > 0.6 || (curvature > 0.72 && okScore < 0.55)) {
    if (perm === "1234") dynamicPerm = "2143";
    else if (perm === "2143") dynamicPerm = "3412";
    else if (perm === "3412") dynamicPerm = "4321";
    else dynamicPerm = "1234";
  }

  const { inside, outside, reason: ioReason } = inferInsideOutside(entanglement, vector);

  const frame: AUFrame = {
    level,
    perm: dynamicPerm,
    permShifted: dynamicPerm !== perm,
    inside,
    outside,
    vector,
    reason: `${permReason} · ${ioReason}`,
  };

  const ops: AUFrameOps = {
    entanglement,
    curvature,
    duality,
    noise,
    resonance,
    derivatives: { d1, W1, attach1 },
  };

  const metrics: AUFrameMetrics = {
    dimensional_distance,
    polarity_gap,
    cycle_conflict,
  };

  return { frame, ops, metrics };
}

// lib/auhash/context.ts

import type { AUFrame, AUFrameOps, AUFrameMetrics } from "./frame";
import type { JuramentoReport } from "./server-au";
import type { AUContextState } from "./state";

import { baseNSignature } from "./baseN";
import { computeEntropy999999 } from "./entropy";
import { computeAUHash } from "./hash";
import { decideRotation, type RotationAction } from "./rotation";
import { computeMatrix4, type MatrixCell } from "./matrix4";
import { entropicIfBlend, entropicReciprocalMultipliers } from "./entropicOperators";
import { decideWanckoMode } from "./wanckoMode";

/* =========================================================
   Types
========================================================= */

export type ContextCell = {
  domain: "E" | "I" | "M" | "G";
  state: "A" | "B" | "C" | "D";
  code: string; // ejemplo: "E-A"
};

export type ContextIntent = "natural" | "performance";

export type AwarenessVector = {
  ICH: number;
  CSC: number;
  UC: number;
  INC: number;
};

export type AffectField = {
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  endorphin: number;
};

export type ContextProfile = {
  specializationBias: number;
  generalizationBias: number;
};

export type ContextDecision = {
  whoDominates: "SELF" | "CONTEXT" | "META";
  channel: "CUMBRE" | "BASE";
};

export type ContextTorBias = {
  biasHold: number;
  biasRelease: number;
  biasSilence: number;
  forceRotate: boolean;
};

export type ContextEngineBias = {
  recommendMode: "wancko" | "hwancko" | "both";
  exposure: "mirror" | "engine" | "both";
};

/* =========================================================
   AU Dynamics (Ψ, R, T, Ω, NAU, PAU)
========================================================= */

export type ContextCoord = {
  seria: number;
  tonta: number;
  juicio: number;
  sesgo: number;
};

export type NAUDynamic = {
  Psi: number;
  R: number;
  T: number;
  magnitude: number;
  phase: number;
};

export type ContextDynamics = {
  Psi: number;
  R: number;
  T: number;
  Omega_SO: number;
  coord: ContextCoord;
  NAU: NAUDynamic;
  PAU: number;
};

export type ContextEvolution = {
  tMs: number;
  dtMs: number;

  alignmentScore: number;
  dAlignment: number;

  entropyRaw: number;
  entropyRatio: number;
  dEntropy: number;

  dynamics: ContextDynamics;
  wancko: ReturnType<typeof decideWanckoMode>;
};

export type ContextAU = {
  baseN: number;
  signature: ReturnType<typeof baseNSignature>;
  matrix4: MatrixCell;
  yoGrad: number;
  auHash: string;
  hashMaterial: string;

  torEffective: {
    biasHoldEff: number;
    biasReleaseEff: number;
    biasSilenceEff: number;
    multipliers: { up: number; down: number; k: number };
  };

  metricsSoft: {
    ddSoft: number;
    pgSoft: number;
    ccSoft: number;
    factors: { ddFactor: number; pgFactor: number; ccFactor: number };
  };
};

export type ContextResult = {
  dominance: ContextDecision;
  tor: ContextTorBias;
  engine: ContextEngineBias;
  explain: string;

  evolution: ContextEvolution;
  entropyExplain: string;
  rotation: RotationAction;
  au: ContextAU;
};

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, lo: number, hi: number) {
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function mean(xs: number[]) {
  if (!xs.length) return 0;
  const valid = xs.filter(v => typeof v === "number" && !Number.isNaN(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function tanh(x: number) {
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

/* =========================================================
   Alignment Score
========================================================= */

function computeAlignmentScore(args: {
  dd: number; pg: number; cc: number;
  res: number; noise: number; curv: number;
  UC: number; INC: number;
  biasHold: number; biasRelease: number; biasSilence: number;
}) {

  const harmony =
    0.30 * (1 - args.cc) +
    0.18 * (1 - args.dd) +
    0.14 * (1 - args.pg) +
    0.20 * args.res +
    0.10 * (1 - args.noise) +
    0.08 * (1 - Math.abs(args.curv - 0.5));

  const regulation = 0.14 * args.UC - 0.10 * args.INC;

  const control =
    0.08 * (1 - args.biasHold) +
    0.06 * args.biasRelease +
    0.04 * (1 - args.biasSilence);

  return clamp01(harmony + regulation + control);
}

/* =========================================================
   Core Context
========================================================= */

export function computeContext(args: {
  frame: AUFrame;
  ops: AUFrameOps;
  metrics: AUFrameMetrics;
  wReport?: JuramentoReport | null;
  hReport?: JuramentoReport | null;
  intent: ContextIntent;
  contextProfile?: ContextProfile;
  awareness?: AwarenessVector;
  affect?: AffectField;
  prev?: AUContextState | null;
  nowMs?: number;
  baseN?: number;
  xForBaseN?: number;
}): ContextResult {

  const nowMs = args.nowMs ?? Date.now();
  const prev = args.prev ?? null;

  const awareness = args.awareness ?? { ICH: 0.5, CSC: 0.5, UC: 0.5, INC: 0.3 };
  const affect = args.affect ?? { dopamine: 0.5, serotonin: 0.5, oxytocin: 0.5, endorphin: 0.5 };
  const profile = args.contextProfile ?? { specializationBias: 0.5, generalizationBias: 0.5 };

  /* =========================================================
     Dominance
  ========================================================= */

  const singularity = clamp01(awareness.ICH);
  const mass = clamp01(awareness.CSC);
  const universal = clamp01(awareness.UC);

  let whoDominates: "SELF" | "CONTEXT" | "META" = "META";

  if (universal > 0.75) whoDominates = "META";
  else if (singularity > mass + 0.15) whoDominates = "SELF";
  else if (mass > singularity + 0.15) whoDominates = "CONTEXT";

  /* =========================================================
     Channel
  ========================================================= */

  let channel: "CUMBRE" | "BASE" = "BASE";

  if (profile.specializationBias > profile.generalizationBias + 0.1)
    channel = "CUMBRE";
  else if (profile.generalizationBias > profile.specializationBias + 0.1)
    channel = "BASE";
  else
    channel = universal > 0.6 ? "CUMBRE" : "BASE";

  /* =========================================================
     Metrics base
  ========================================================= */

  const dd0 = clamp01(args.metrics.dimensional_distance);
  const pg0 = clamp01(args.metrics.polarity_gap);
  const cc0 = clamp01(args.metrics.cycle_conflict);

  const ent0 = clamp01(args.ops.entanglement);
  const res0 = clamp01(args.ops.resonance);
  const curv0 = clamp01(args.ops.curvature);
  const noise0 = clamp01(args.ops.noise);

  /* =========================================================
     TOR base
  ========================================================= */

  const biasHold0 = clamp01(0.45 * pg0 + 0.25 * cc0 + 0.2 * affect.serotonin + 0.1 * universal);
  const biasSilence0 = clamp01(0.55 * dd0 + 0.3 * noise0 + 0.25 * awareness.INC);
  const biasRelease0 = clamp01(0.45 * ent0 + 0.3 * res0 + 0.2 * affect.dopamine - biasHold0 * 0.35);

  /* =========================================================
     Entropy base
  ========================================================= */

  const entropy = computeEntropy999999({
    dd: dd0, pg: pg0, cc: cc0,
    ent: ent0, res: res0, curv: curv0, noise: noise0,
    ICH: awareness.ICH, CSC: awareness.CSC,
    UC: awareness.UC, INC: awareness.INC,
    biasHold: biasHold0,
    biasRelease: biasRelease0,
    biasSilence: biasSilence0,
  });

  const dtMs = Math.max(1, nowMs - (prev?.tMs ?? nowMs));
  const dtMin = dtMs / 60000;

  /* =========================================================
     Ψ
  ========================================================= */

  const alignmentScore = computeAlignmentScore({
    dd: dd0, pg: pg0, cc: cc0,
    res: res0, noise: noise0, curv: curv0,
    UC: awareness.UC,
    INC: awareness.INC,
    biasHold: biasHold0,
    biasRelease: biasRelease0,
    biasSilence: biasSilence0,
  });

  const prevPsi = prev?.alignmentScore ?? alignmentScore;
  const dAlignment = alignmentScore - prevPsi;

  /* =========================================================
     R & T (dinámicos reales)
  ========================================================= */

  const R = dAlignment / (dtMin || 1e-9);
  const prevR = prev?.R ?? R;
  const T = (R - prevR) / (dtMin || 1e-9);

  /* =========================================================
     Ω_SO
  ========================================================= */

  const Omega_SO = clamp01(Math.abs(singularity - mass));

  /* =========================================================
     Seria / Tonta / Juicio / Sesgo
  ========================================================= */

  const S = alignmentScore;
  const O = 1 - entropy.ratio;

  const seria = clamp01(0.6 * O + 0.4 * (1 - Math.abs(R) / 2));
  const tonta = clamp01(0.6 * entropy.ratio + 0.4 * Math.abs(T) / 10);

  const juicio = clamp01(1 - Omega_SO);
  const sesgo = clamp01(Omega_SO);

  /* =========================================================
     NAU
  ========================================================= */

  const Rn = tanh(R * 2.5);
  const Tn = tanh(T * 0.8);

  const magnitude = clamp01(Math.sqrt(S * S + 0.25 * Rn * Rn + 0.15 * Tn * Tn));
  const phase = clamp01((Math.atan2(Rn + 0.5 * Tn, S + 1e-9) + Math.PI) / (2 * Math.PI));

  const NAU: NAUDynamic = { Psi: S, R, T, magnitude, phase };

  const g = clamp01(0.5 + 0.5 * tanh(1.2 * Rn + 0.8 * Tn));
  const PAU = clamp01(S * g);

  const dynamics: ContextDynamics = {
    Psi: S,
    R,
    T,
    Omega_SO,
    coord: { seria, tonta, juicio, sesgo },
    NAU,
    PAU,
  };

/* =========================================================
   CELDA16 (Dominio × Estado)
========================================================= */

// 1️⃣ Dominio dominante

let domain: "E" | "I" | "M" | "G" = "E";

if (dd0 >= res0 && dd0 >= ent0 && dd0 >= awareness.UC) domain = "E";
else if (res0 >= dd0 && res0 >= ent0 && res0 >= awareness.UC) domain = "I";
else if (ent0 >= dd0 && ent0 >= res0 && ent0 >= awareness.UC) domain = "M";
else domain = "G";

// 2️⃣ Estado relacional

let state: "A" | "B" | "C" | "D" = "C";

const dynamicEnergy = Math.abs(R) + Math.abs(T);

if (dynamics.coord.juicio > 0.7 && alignmentScore > 0.6) {
  state = "A"; // coherente
}
else if (dynamics.coord.sesgo > 0.7 && alignmentScore < 0.5) {
  state = "B"; // desalineado
}
else if (dynamicEnergy < 0.05) {
  state = "C"; // neutro / latente
}
else if (Math.abs(T) > 0.5) {
  state = "D"; // transmutación
}

const cell = {
  domain,
  state,
  code: `${domain}-${state}`,
};

const wancko = decideWanckoMode({
  intent: args.intent,   // 🔥 FIX DIRECTO
  entropyRatio: entropy.ratio,
  Psi: dynamics.Psi,
  R: dynamics.R,
  T: dynamics.T,
  Omega_SO: dynamics.Omega_SO,
  juicio: dynamics.coord.juicio,
  sesgo: dynamics.coord.sesgo,
  cell,
});

  /* =========================================================
     Rotation
  ========================================================= */

  const rotation = decideRotation({
    entropyRatio: entropy.ratio,
    dEntropy: entropy.raw - (prev?.entropyRaw ?? entropy.raw),
    alignmentScore,
    dAlignment,
    whoDominates,
    channel,
    forceRotate: entropy.ratio > 0.85,
    intent: args.intent,
    UC: awareness.UC,
    INC: awareness.INC,
  });

  /* =========================================================
     BaseN + Hash
  ========================================================= */

  const N = args.baseN ?? 16;
  const x = Math.round(
    1000 * alignmentScore +
    700 * entropy.ratio +
    500 * awareness.ICH +
    300 * awareness.CSC +
    200 * awareness.UC +
    150 * awareness.INC
  );

  const sig = baseNSignature(x, N);
  const matrix4 = computeMatrix4(sig.phase);

  const { auHash, yoGrad, hashMaterial } = computeAUHash({
    tMs: nowMs,
    intent: args.intent,
    ICH: awareness.ICH,
    CSC: awareness.CSC,
    UC: awareness.UC,
    INC: awareness.INC,
    alignmentScore,
    entropyRaw: entropy.raw,
    sig,
    whoDominates,
    channel,
  });

  /* =========================================================
     Explain
  ========================================================= */

  const explain =
    `Dominance=${whoDominates} via ${channel}. ` +
    `Ψ=${S.toFixed(3)} R=${R.toFixed(3)} T=${T.toFixed(3)} Ω=${Omega_SO.toFixed(3)} P=${PAU.toFixed(3)}. ` +
    `E=${entropy.raw}. Hash=${auHash}.`;

  return {
    dominance: { whoDominates, channel },

    tor: {
      biasHold: biasHold0,
      biasRelease: biasRelease0,
      biasSilence: biasSilence0,
      forceRotate: entropy.ratio > 0.85,
    },

    engine: {
      recommendMode: "wancko",
      exposure: "engine",
    },

    explain,

    evolution: {
      tMs: nowMs,
      dtMs,
      alignmentScore,
      dAlignment,
      entropyRaw: entropy.raw,
      entropyRatio: entropy.ratio,
      dEntropy: entropy.raw - (prev?.entropyRaw ?? entropy.raw),
      dynamics,
      wancko,
    },

    entropyExplain: entropy.explain,
    rotation,

    au: {
      baseN: N,
      signature: sig,
      matrix4,
      yoGrad,
      auHash,
      hashMaterial,
      cell,
      torEffective: {
        biasHoldEff: biasHold0,
        biasReleaseEff: biasRelease0,
        biasSilenceEff: biasSilence0,
        multipliers: { up: 1, down: 1, k: 0 },
      },
      metricsSoft: {
        ddSoft: dd0,
        pgSoft: pg0,
        ccSoft: cc0,
        factors: { ddFactor: 1, pgFactor: 1, ccFactor: 1 },
      },
    },
  };
}
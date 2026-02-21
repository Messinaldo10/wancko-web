// lib/auhash/context.ts

import type { AUFrame, AUFrameOps, AUFrameMetrics } from "./frame";
import type { JuramentoReport } from "./server-au";
import type { AUContextState } from "./state";

import { baseNSignature } from "./baseN";
import { computeEntropy999999 } from "./entropy";
import { computeAUHash } from "./hash";
import { decideRotation, type RotationAction } from "./rotation";
import { computeMatrix4, type MatrixCell } from "./matrix4";

import { decideWanckoMode } from "./wanckoMode";
import { computePhysicsAU } from "./physicsAU";
import { decideBaskiGuard } from "./baskiGuard";

/* =========================================================
   Types
========================================================= */

export type ContextCell = {
  domain: "E" | "I" | "M" | "G";
  state: "A" | "B" | "C" | "D";
  code: string; // "E-A"
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

  // Baski visible (para UI/debug)
  baski: {
    lockPropulsion: boolean;
    clampTMax: number;
    dampExtra: number;
    reason: string;
  };

  // debug físico opcional
  physics?: {
    R_raw: number;
    T_raw: number;
    alphaR: number;
    alphaT: number;
    Tmax: number;
    jerkMax: number;
    damping: number;
  };
};

export type ContextEvolution = {
  tMs: number;
  dtMs: number;

  alignmentScore: number; // Ψ
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

  // CELDA16 aquí (para no romper stream/UI)
  cell: ContextCell;
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
function mean(xs: number[]) {
  const valid = xs.filter(v => typeof v === "number" && !Number.isNaN(v));
  if (!valid.length) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/* =========================================================
   Alignment Score (Ψ base)
========================================================= */

function computeAlignmentScore(args: {
  dd: number; pg: number; cc: number;
  res: number; noise: number; curv: number;
  UC: number; INC: number;
  biasHold: number; biasRelease: number; biasSilence: number;
}) {
  const dd = clamp01(args.dd);
  const pg = clamp01(args.pg);
  const cc = clamp01(args.cc);
  const res = clamp01(args.res);
  const noise = clamp01(args.noise);
  const curv = clamp01(args.curv);
  const UC = clamp01(args.UC);
  const INC = clamp01(args.INC);

  const hold = clamp01(args.biasHold);
  const rel  = clamp01(args.biasRelease);
  const sil  = clamp01(args.biasSilence);

  const harmony =
    0.30 * (1 - cc) +
    0.18 * (1 - dd) +
    0.14 * (1 - pg) +
    0.20 * res +
    0.10 * (1 - noise) +
    0.08 * (1 - Math.abs(curv - 0.5));

  const regulation = 0.14 * UC - 0.10 * INC;
  const control =
    0.08 * (1 - hold) +
    0.06 * rel +
    0.04 * (1 - sil);

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

  const intent = args.intent;               // ✅ evita “intent is not defined”
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
  if (profile.specializationBias > profile.generalizationBias + 0.1) channel = "CUMBRE";
  else if (profile.generalizationBias > profile.specializationBias + 0.1) channel = "BASE";
  else channel = universal > 0.6 ? "CUMBRE" : "BASE";

  /* =========================================================
     Metrics + Ops
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
     Entropy 999999
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

  /* =========================================================
     Ψ (alignmentScore)
  ========================================================= */

  const Psi = computeAlignmentScore({
    dd: dd0, pg: pg0, cc: cc0,
    res: res0, noise: noise0, curv: curv0,
    UC: awareness.UC,
    INC: awareness.INC,
    biasHold: biasHold0,
    biasRelease: biasRelease0,
    biasSilence: biasSilence0,
  });

  const prevPsi = prev?.alignmentScore ?? Psi;
  const dPsi = Psi - prevPsi;

  /* =========================================================
     Ω_SO
  ========================================================= */

  const Omega_SO = clamp01(Math.abs(singularity - mass));

  /* =========================================================
     Seria/Tonta + Juicio/Sesgo
  ========================================================= */

  // “Organización” O la aproximamos como (1 - entropía ratio) por ahora
  const O = clamp01(1 - entropy.ratio);

  // Juicio/sesgo derivados del gap singularidad-masa
  const juicio = clamp01(1 - Omega_SO);
  const sesgo = clamp01(Omega_SO);

  // Seria/Tonta acopladas a (O) y a la dinámica (se refinan más adelante)
  // NOTA: aquí aún no usamos R/T; eso lo fija physicsAU con estabilidad
  const seria = clamp01(0.65 * O + 0.35 * juicio);
  const tonta = clamp01(0.65 * entropy.ratio + 0.35 * sesgo);

  const coord: ContextCoord = { seria, tonta, juicio, sesgo };

  /* =========================================================
     Física AU completa: R/T estables + PAU estable
  ========================================================= */

  const phys = computePhysicsAU({
    Psi,
    dPsi,
    dtMs,
    entropyRatio: entropy.ratio,
    Omega_SO,
    sesgo,
    prev: prev ? { R_s: prev.R_s, T_s: prev.T_s } : null,
  });

  /* =========================================================
     Baski guard: limita propulsión y T según riesgo
  ========================================================= */

  const baski = decideBaskiGuard({
    entropyRatio: entropy.ratio,
    sesgo,
    Omega_SO,
    Psi: phys.Psi,
    R: phys.R,
    T: phys.T,
  });

  // Aplicación Baski: clamp adicional T + damping extra + lock P
  const T_b = Math.max(-baski.clampTMax, Math.min(baski.clampTMax, phys.T));
  let P_b = phys.PAU * (1 - baski.dampExtra);
  if (baski.lockPropulsion) P_b = 0;

  const dynamics: ContextDynamics = {
    Psi: phys.Psi,
    R: phys.R,
    T: T_b,
    Omega_SO,
    coord,
    NAU: { ...phys.NAU, T: T_b },
    PAU: clamp01(P_b),
    baski,
    physics: {
      R_raw: phys.raw.R_raw,
      T_raw: phys.raw.T_raw,
      alphaR: phys.raw.alphaR,
      alphaT: phys.raw.alphaT,
      Tmax: phys.raw.Tmax,
      jerkMax: phys.raw.jerkMax,
      damping: phys.raw.damping,
    },
  };

  /* =========================================================
     CELDA16 (Dominio × Estado)
  ========================================================= */

  let domain: "E" | "I" | "M" | "G" = "E";
  if (dd0 >= res0 && dd0 >= ent0 && dd0 >= awareness.UC) domain = "E";
  else if (res0 >= dd0 && res0 >= ent0 && res0 >= awareness.UC) domain = "I";
  else if (ent0 >= dd0 && ent0 >= res0 && ent0 >= awareness.UC) domain = "M";
  else domain = "G";

  let state: "A" | "B" | "C" | "D" = "C";
  const dynamicEnergy = Math.abs(dynamics.R) + 0.35 * Math.abs(dynamics.T);

  if (coord.juicio > 0.7 && Psi > 0.6) state = "A";
  else if (coord.sesgo > 0.7 && Psi < 0.5) state = "B";
  else if (dynamicEnergy < 0.08) state = "C";
  else if (Math.abs(dynamics.T) > 0.65) state = "D";

  const cell: ContextCell = { domain, state, code: `${domain}-${state}` };

  /* =========================================================
     Wancko mode decision (R/T/P/C)
  ========================================================= */

  const wancko = decideWanckoMode({
    intent,
    entropyRatio: entropy.ratio,
    Psi: dynamics.Psi,
    R: dynamics.R,
    T: dynamics.T,
    Omega_SO: dynamics.Omega_SO,
    juicio: coord.juicio,
    sesgo: coord.sesgo,
    cell,
    baskiLock: dynamics.baski.lockPropulsion,
  });

  /* =========================================================
     Rotation (A) — usa dinámica estable + entropía
  ========================================================= */

  const dEntropy = entropy.raw - (prev?.entropyRaw ?? entropy.raw);
  const rotation = decideRotation({
    entropyRatio: entropy.ratio,
    dEntropy,
    alignmentScore: Psi,
    dAlignment: dPsi,
    whoDominates,
    channel,
    forceRotate: entropy.ratio > 0.85 || dynamics.baski.lockPropulsion,
    intent,
    UC: awareness.UC,
    INC: awareness.INC,
  });

  /* =========================================================
     BaseN + Hash + Matrix4 (C + D)
  ========================================================= */

  const N = args.baseN ?? 16;
  const x =
    args.xForBaseN ??
    Math.round(
      1000 * Psi +
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
    intent,
    ICH: awareness.ICH,
    CSC: awareness.CSC,
    UC: awareness.UC,
    INC: awareness.INC,
    alignmentScore: Psi,
    entropyRaw: entropy.raw,
    sig,
    whoDominates,
    channel,
  });

  /* =========================================================
     Explain (útil para logs)
  ========================================================= */

  const explain =
    `Dominance=${whoDominates} via ${channel}. ` +
    `Ψ=${dynamics.Psi.toFixed(3)} R=${dynamics.R.toFixed(3)} T=${dynamics.T.toFixed(3)} Ω=${Omega_SO.toFixed(3)} P=${dynamics.PAU.toFixed(3)}. ` +
    `E=${entropy.raw} r=${entropy.ratio.toFixed(3)} dE=${dEntropy}. ` +
    `Cell=${cell.code} Wancko=${wancko.mode}. ` +
    `Baski=${dynamics.baski.lockPropulsion ? "LOCK" : "OK"}. ` +
    `Hash=${auHash}.`;

  return {
    dominance: { whoDominates, channel },

    tor: {
      biasHold: biasHold0,
      biasRelease: biasRelease0,
      biasSilence: biasSilence0,
      forceRotate: entropy.ratio > 0.85 || dynamics.baski.lockPropulsion,
    },

    engine: {
      recommendMode: "wancko",
      exposure: "engine",
    },

    explain,

    evolution: {
      tMs: nowMs,
      dtMs,
      alignmentScore: Psi,
      dAlignment: dPsi,
      entropyRaw: entropy.raw,
      entropyRatio: entropy.ratio,
      dEntropy,
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
    },
  };
}
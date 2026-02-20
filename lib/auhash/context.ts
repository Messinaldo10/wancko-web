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

/* =========================================================
   Types
========================================================= */

export type ContextIntent = "natural" | "performance";

export type AwarenessVector = {
  ICH: number; // conciencia individual
  CSC: number; // colectiva (contexto)
  UC: number;  // universal (marco superior)
  INC: number; // inconsciente (latente)
};

export type AffectField = {
  dopamine: number;
  serotonin: number;
  oxytocin: number;
  endorphin: number;
};

export type ContextProfile = {
  specializationBias: number;  // cumbre
  generalizationBias: number;  // base
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

export type AUCoherenceDynamics = {
  // Ψ, R, T (explícitos)
  Psi: number;       // 0..1
  R: number;         // dΨ/dt (por minuto)
  T: number;         // d²Ψ/dt² (por minuto²)

  // IsoSense / DiaSense
  Omega_SO: number;  // |S - O|  (0..1)

  // N_AU(t) = Ψ + iR + jT (representación operativa)
  NAU: {
    Psi: number;
    R: number;
    T: number;
    magnitude: number; // norma (acotada)
    phase: number;     // 0..1 fase derivada
  };

  // Propulsión acotada (0..1)
  PAU: number;
};

export type ContextEvolution = {
  tMs: number;
  dtMs: number;

  alignmentScore: number;     // 0..1 agregado (Ψ)
  dAlignment: number;         // delta vs prev
  vAlignmentPerMin: number;   // velocidad (por minuto) (R)

  entropyRaw: number;         // 0..999999
  entropyRatio: number;       // 0..1
  dEntropy: number;           // delta raw

  // ✅ NUEVO: formalización AU
  dynamics: AUCoherenceDynamics;
};

export type ContextAU = {
  baseN: number;
  signature: ReturnType<typeof baseNSignature>;
  matrix4: MatrixCell;
  yoGrad: number;
  auHash: string;
  hashMaterial: string;

  // Extras útiles para depurar el “natural/no-ismo”
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
  // estable
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}

/**
 * Score agregado simple (0..1) basado en tu propia semántica:
 * - Menos conflicto, menos distancia, menos ruido = mejor
 * - Más resonance = mejor
 * - UC regula y estabiliza
 * - INC penaliza (latente)
 */
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
    0.08 * (1 - Math.abs(curv - 0.5)); // curv demasiado alta/baja penaliza

  const regulation = 0.14 * UC - 0.10 * INC;

  const control = 0.08 * (1 - hold) + 0.06 * rel + 0.04 * (1 - sil);

  return clamp01(harmony + regulation + control);
}

/**
 * Formaliza Ψ, R, T, Ω_SO, N_AU(t), P_AU
 * - Ψ = alignmentScore
 * - R = vAlignmentPerMin
 * - T = dR/dt (por minuto^2)
 * - Ω_SO = |ICH - CSC|
 *
 * P_AU: estable y acotada:
 *   P = Ψ * g(R, T)
 * donde g usa tanh para evitar explosiones.
 */
function computeAUDynamics(args: {
  Psi: number;                 // 0..1
  vAlignmentPerMin: number;    // R
  dtMs: number;
  prevVAlignmentPerMin?: number | null; // para T
  ICH: number;
  CSC: number;
}) : AUCoherenceDynamics {
  const Psi = clamp01(args.Psi);

  const dtMin = Math.max(1e-6, args.dtMs / 60000);
  const R = args.vAlignmentPerMin; // puede ser negativo/positivo

  const prevR = args.prevVAlignmentPerMin ?? null;
  const T = prevR === null ? 0 : (R - prevR) / dtMin; // min^-2

  const Omega_SO = clamp01(Math.abs(clamp01(args.ICH) - clamp01(args.CSC)));

  // Normalizaciones suaves para NAU / P_AU
  const Rn = tanh(R * 3);     // -1..1 (escala)
  const Tn = tanh(T * 0.8);   // -1..1 (más conservador)

  const magnitude = clamp01(Math.sqrt(Psi * Psi + 0.25 * Rn * Rn + 0.15 * Tn * Tn));
  const phase = clamp01((Math.atan2(Rn + 0.5 * Tn, Psi + 1e-9) + Math.PI) / (2 * Math.PI));

  // P_AU = Ψ * (1 + R + T) pero acotado y estable
  // g = 0.5 + 0.5*tanh( a*Rn + b*Tn )
  const g = clamp01(0.5 + 0.5 * tanh(1.2 * Rn + 0.8 * Tn));
  const PAU = clamp01(Psi * g);

  return {
    Psi,
    R,
    T,
    Omega_SO,
    NAU: { Psi, R, T, magnitude, phase },
    PAU,
  };
}

/* =========================================================
   Core Context Logic
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

  const { ops, metrics, wReport, hReport, intent } = args;

  const nowMs = args.nowMs ?? Date.now();
  const prev = args.prev ?? null;

  const awareness: AwarenessVector = args.awareness ?? {
    ICH: 0.5,
    CSC: 0.5,
    UC: 0.5,
    INC: 0.3,
  };

  const affect: AffectField = args.affect ?? {
    dopamine: 0.5,
    serotonin: 0.5,
    oxytocin: 0.5,
    endorphin: 0.5,
  };

  const contextProfile: ContextProfile = args.contextProfile ?? {
    specializationBias: 0.5,
    generalizationBias: 0.5,
  };

  /* =========================================================
     1️⃣ Masa vs Singularidad (+ META por UC)
  ========================================================= */

  const singularity = clamp01(awareness.ICH);
  const mass = clamp01(awareness.CSC);
  const universal = clamp01(awareness.UC);

  let whoDominates: "SELF" | "CONTEXT" | "META" = "META";

  if (universal > 0.75) whoDominates = "META";
  else if (singularity > mass + 0.15) whoDominates = "SELF";
  else if (mass > singularity + 0.15) whoDominates = "CONTEXT";
  else whoDominates = "META";

  /* =========================================================
     2️⃣ Cumbre vs Base (estabilizado)
  ========================================================= */

  let channel: "CUMBRE" | "BASE" = "BASE";

  const spec = clamp01(contextProfile.specializationBias);
  const gen = clamp01(contextProfile.generalizationBias);

  if (spec > gen + 0.1) channel = "CUMBRE";
  else if (gen > spec + 0.1) channel = "BASE";
  else channel = universal > 0.6 ? "CUMBRE" : "BASE";

  /* =========================================================
     3️⃣ Métricas + Ops base
  ========================================================= */

  const dd0 = clamp01(metrics.dimensional_distance);
  const pg0 = clamp01(metrics.polarity_gap);
  const cc0 = clamp01(metrics.cycle_conflict);

  const ent0 = clamp01(ops.entanglement);
  const res0 = clamp01(ops.resonance);
  const curv0 = clamp01(ops.curvature);
  const noise0 = clamp01(ops.noise);

  /* =========================================================
     4️⃣ TOR Bias (base)
  ========================================================= */

  const dominanceSig = mean([
    wReport?.signals?.dominance ?? 0,
    hReport?.signals?.dominance ?? 0,
  ]);

  const silenceRatio = mean([
    wReport?.signals?.silenceRatio ?? 0,
    hReport?.signals?.silenceRatio ?? 0,
  ]);

  const biasHold0 = clamp01(
    0.45 * pg0 +
    0.25 * cc0 +
    0.2 * affect.serotonin +
    0.1 * universal
  );

  const biasSilence0 = clamp01(
    0.55 * dd0 +
    0.3 * noise0 +
    0.25 * awareness.INC
  );

  const biasRelease0 = clamp01(
    0.45 * ent0 +
    0.3 * res0 +
    0.2 * affect.dopamine -
    biasHold0 * 0.35
  );

  /* =========================================================
     5️⃣ Entropía base (gobierna blends/multiplicadores)
  ========================================================= */

  const entropyBase = computeEntropy999999({
    dd: dd0, pg: pg0, cc: cc0,
    ent: ent0, res: res0, curv: curv0, noise: noise0,
    ICH: awareness.ICH, CSC: awareness.CSC, UC: awareness.UC, INC: awareness.INC,
    biasHold: biasHold0,
    biasRelease: biasRelease0,
    biasSilence: biasSilence0,
  });

  const dtMs = Math.max(1, nowMs - (prev?.tMs ?? nowMs));
  const dEntropyBase = entropyBase.raw - (prev?.entropyRaw ?? entropyBase.raw);

  /* =========================================================
     6️⃣ Operadores entrópicos: IF → mezcla + multiplicación recíproca
  ========================================================= */

  const highE_strength = clamp01((entropyBase.ratio - 0.72) / (0.90 - 0.72)); // 0..1
  const lowE_strength  = clamp01((0.28 - entropyBase.ratio) / (0.28 - 0.10)); // 0..1

  const ddFactorHigh = entropicIfBlend({
    ifTrue: 0.85,
    ifFalse: 1.0,
    conditionStrength: highE_strength,
    entropyRatio: entropyBase.ratio,
  });

  const ddFactorLow = entropicIfBlend({
    ifTrue: 1.10,
    ifFalse: 1.0,
    conditionStrength: lowE_strength,
    entropyRatio: entropyBase.ratio,
  });

  const ddFactor = ddFactorHigh * ddFactorLow;
  const dd = clamp01(dd0 * ddFactor);

  const pgFactor = entropicIfBlend({
    ifTrue: 0.92,
    ifFalse: 1.0,
    conditionStrength: highE_strength,
    entropyRatio: entropyBase.ratio,
  });

  const ccFactor = entropicIfBlend({
    ifTrue: 0.90,
    ifFalse: 1.0,
    conditionStrength: highE_strength,
    entropyRatio: entropyBase.ratio,
  });

  const pg = clamp01(pg0 * pgFactor);
  const cc = clamp01(cc0 * ccFactor);

  // Multiplicadores recíprocos para TOR (media geométrica = 1)
  const torSignal = clamp(biasRelease0 - biasHold0, -1, 1);
  const mul = entropicReciprocalMultipliers({
    signal: torSignal,
    entropyRatio: entropyBase.ratio,
    maxK: 0.55,
  });

  const biasReleaseEff = clamp01(biasRelease0 * mul.up);
  const biasHoldEff    = clamp01(biasHold0 * mul.down);

  const silFactor = entropicIfBlend({
    ifTrue: 1.08,
    ifFalse: 0.94,
    conditionStrength: highE_strength,
    entropyRatio: entropyBase.ratio,
  });

  const biasSilenceEff = clamp01(biasSilence0 * silFactor);

  /* =========================================================
     7️⃣ Entropía final (recomputada con efectivas)
  ========================================================= */

  const entropy = computeEntropy999999({
    dd, pg, cc,
    ent: ent0, res: res0, curv: curv0, noise: noise0,
    ICH: awareness.ICH, CSC: awareness.CSC, UC: awareness.UC, INC: awareness.INC,
    biasHold: biasHoldEff,
    biasRelease: biasReleaseEff,
    biasSilence: biasSilenceEff,
  });

  const dEntropyFinal = entropy.raw - (prev?.entropyRaw ?? entropy.raw);

  /* =========================================================
     8️⃣ forceRotate (soft)
  ========================================================= */

  const forceRotate =
    cc > 0.65 ||
    curv0 > 0.8 ||
    awareness.INC > 0.7 ||
    entropy.ratio > 0.85;

  /* =========================================================
     9️⃣ Engine Bias
  ========================================================= */

  let recommendMode: "wancko" | "hwancko" | "both" = "both";

  if (whoDominates === "SELF") recommendMode = dominanceSig >= silenceRatio ? "wancko" : "hwancko";
  if (whoDominates === "CONTEXT") recommendMode = silenceRatio >= dominanceSig ? "hwancko" : "wancko";
  if (whoDominates === "META") recommendMode = "both";

  if (intent === "natural") recommendMode = "hwancko";
  if (intent === "performance") recommendMode = "wancko";

  const exposure =
    recommendMode === "both"
      ? "both"
      : recommendMode === "wancko"
      ? "engine"
      : "mirror";

  /* =========================================================
     🔟 Ψ (alignmentScore) + R (dΨ/dt) + dN/dt
  ========================================================= */

  const alignmentScore = computeAlignmentScore({
    dd, pg, cc,
    res: res0,
    noise: noise0,
    curv: curv0,
    UC: awareness.UC,
    INC: awareness.INC,
    biasHold: biasHoldEff,
    biasRelease: biasReleaseEff,
    biasSilence: biasSilenceEff,
  });

  const dAlignment = alignmentScore - (prev?.alignmentScore ?? alignmentScore);
  const vAlignmentPerMin = dAlignment / (dtMs / 60000);

  /* =========================================================
     1️⃣1️⃣ AU Dynamics explícito: Ψ, R, T, Ω_SO, N_AU, P_AU
     - T usa prev.vAlignmentPerMin si lo guardas; si no, cae a 0.
  ========================================================= */

  const prevV = (prev as any)?.vAlignmentPerMin ?? null; // compat: si no existe, null
  const dynamics = computeAUDynamics({
    Psi: alignmentScore,
    vAlignmentPerMin,
    dtMs,
    prevVAlignmentPerMin: typeof prevV === "number" ? prevV : null,
    ICH: awareness.ICH,
    CSC: awareness.CSC,
  });

  /* =========================================================
     1️⃣2️⃣ Rotación estructural (A)
  ========================================================= */

  const rotation = decideRotation({
    entropyRatio: entropy.ratio,
    dEntropy: dEntropyFinal,
    alignmentScore,
    dAlignment,
    whoDominates,
    channel,
    forceRotate,
    intent,
    UC: awareness.UC,
    INC: awareness.INC,
  });

  /* =========================================================
     1️⃣3️⃣ Base N + Hash + Matrix4 (C + D)
  ========================================================= */

  const N = args.baseN ?? 16;

  const x =
    args.xForBaseN ??
    Math.round(
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
    intent,
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
     1️⃣4️⃣ Explicación
  ========================================================= */

  const explain =
    `Dominance=${whoDominates} via ${channel}. ` +
    `Mass=${mass.toFixed(2)} Singularity=${singularity.toFixed(2)} Universal=${universal.toFixed(2)}. ` +
    `DimDist=${dd.toFixed(2)} PolGap=${pg.toFixed(2)} CycleConf=${cc.toFixed(2)}. ` +
    `Hold=${biasHoldEff.toFixed(2)} Release=${biasReleaseEff.toFixed(2)} Silence=${biasSilenceEff.toFixed(2)}. ` +
    `Ψ=${dynamics.Psi.toFixed(3)} R=${dynamics.R.toFixed(3)} T=${dynamics.T.toFixed(3)} Ω=${dynamics.Omega_SO.toFixed(3)} P=${dynamics.PAU.toFixed(3)}. ` +
    `E=${entropy.raw} dE=${dEntropyFinal}. ` +
    `Rot=${rotation.type}. ` +
    `Hash=${auHash}.`;

  return {
    dominance: { whoDominates, channel },

    // Tor “base” (para trazabilidad); el efectivo queda en au.torEffective
    tor: {
      biasHold: biasHold0,
      biasRelease: biasRelease0,
      biasSilence: biasSilence0,
      forceRotate,
    },

    engine: {
      recommendMode,
      exposure,
    },

    explain,

    evolution: {
      tMs: nowMs,
      dtMs,

      alignmentScore,
      dAlignment,
      vAlignmentPerMin,

      entropyRaw: entropy.raw,
      entropyRatio: entropy.ratio,
      dEntropy: dEntropyFinal,

      dynamics,
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

      torEffective: {
        biasHoldEff,
        biasReleaseEff,
        biasSilenceEff,
        multipliers: mul,
      },

      metricsSoft: {
        ddSoft: dd,
        pgSoft: pg,
        ccSoft: cc,
        factors: { ddFactor, pgFactor, ccFactor },
      },
    },
  };
}
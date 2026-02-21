// lib/auhash/engineRunner.ts

import type { AUFrameOps } from "./frame";
import type { ContextIntent } from "./context";
import type { AUContextState } from "./state";

import { computeContext } from "./context";
import { applyRotation } from "./applyRotation";
import { applyWanckoMode } from "./applyWanckoMode";
import { appendTick } from "./persistence";

export class AUEngineRunner {
  private last: AUContextState | null = null;
  private opsLive: AUFrameOps;

  constructor(initialOps: AUFrameOps) {
    this.opsLive = initialOps;
  }

  tick(args: {
    frame: any;
    metrics: any;
    intent: ContextIntent;
  }) {
    const result = computeContext({
      frame: args.frame,
      ops: this.opsLive,
      metrics: args.metrics,
      intent: args.intent,
      prev: this.last,
      nowMs: Date.now(),
    });

    // 1️⃣ Rotación estructural
    const appliedRot = applyRotation({
      rotation: result.rotation,
      ops: this.opsLive,
      dominance: result.dominance,
      entropyRatio: result.evolution.entropyRatio,
      propulsion: result.evolution.dynamics.PAU,
    });

    // 2️⃣ Wancko Mode
    const wanckoMode = result.evolution.wancko?.mode ?? "C";

    const appliedMode = applyWanckoMode({
      mode: wanckoMode,
      ops: appliedRot.ops,
      entropyRatio: result.evolution.entropyRatio,
      Psi: result.evolution.dynamics.Psi,
    });

    this.opsLive = appliedMode.ops;

    // 3️⃣ Persistimos estado dinámico COMPLETO
   this.last = {
  tMs: result.evolution.tMs,
  dominance: result.dominance,
  tor: result.tor,
  engine: result.engine,

  alignmentScore: result.evolution.alignmentScore,

  entropyRaw: result.evolution.entropyRaw,
  entropyRatio: result.evolution.entropyRatio,

  // usamos R real desde dynamics
  R: result.evolution.dynamics.R,

  auHash: result.au.auHash,
  rotationCount: (this.last?.rotationCount ?? 0) + 1,
};

    // 4️⃣ Persistencia externa
    appendTick({
      tMs: result.evolution.tMs,
      Psi: result.evolution.dynamics.Psi,
      R: result.evolution.dynamics.R,
      T: result.evolution.dynamics.T,
      P: result.evolution.dynamics.PAU,
      entropyRatio: result.evolution.entropyRatio,
      phase: result.evolution.dynamics.NAU.phase,
      rotation: result.rotation.type,
      dominance: `${result.dominance.whoDominates}_${result.dominance.channel}`,
      mode: wanckoMode,
    });

    return {
      ...result,
      meta: {
        note: "AU Engine live",
        opsNote: appliedMode.note,
        timestamp: Date.now(),
      },
    };
  }

  getState() {
    return this.last;
  }

  getOps() {
    return this.opsLive;
  }
}
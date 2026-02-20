import type { AUFrame, AUFrameOps, AUFrameMetrics } from "./frame";
import type { JuramentoReport } from "./server-au";
import type { ContextIntent } from "./context";
import type { AUContextState } from "./state";

import { computeContext } from "./context";
import { applyRotation } from "./applyRotation";

export class AUEngineRunner {

  private last: AUContextState | null = null;
  private opsLive: AUFrameOps;

  constructor(initialOps: AUFrameOps) {
    this.opsLive = initialOps;
  }

  tick(args: {
    frame: AUFrame;
    metrics: AUFrameMetrics;
    wReport?: JuramentoReport | null;
    hReport?: JuramentoReport | null;
    intent: ContextIntent;
  }) {

    const result = computeContext({
      frame: args.frame,
      ops: this.opsLive,
      metrics: args.metrics,
      wReport: args.wReport,
      hReport: args.hReport,
      intent: args.intent,
      prev: this.last,
    });

 const applied = applyRotation({
  rotation: result.rotation,
  ops: this.opsLive,
  dominance: result.dominance,
  entropyRatio: result.evolution.entropyRatio,
  propulsion: result.evolution.dynamics.PAU, // ← añadir esto
});

    this.opsLive = applied.ops;

    this.last = {
      tMs: result.evolution.tMs,
      dominance: result.dominance,
      tor: result.tor,
      engine: result.engine,

      alignmentScore: result.evolution.alignmentScore,
      vAlignmentPerMin: result.evolution.vAlignmentPerMin,

      entropyRaw: result.evolution.entropyRaw,
      entropyRatio: result.evolution.entropyRatio,

      auHash: result.au.auHash,
    };

    return result;
  }

  getState() {
    return this.last;
  }

  getOps() {
    return this.opsLive;
  }
}
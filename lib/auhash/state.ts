// lib/auhash/state.ts

import type { ContextDecision, ContextTorBias, ContextEngineBias } from "./context";

export type AUContextState = {
  tMs: number;

  dominance: ContextDecision;
  tor: ContextTorBias;
  engine: ContextEngineBias;

  alignmentScore: number;   // Ψ
  vAlignmentPerMin: number; // ✅ R anterior (esto alimenta T)
  entropyRaw: number;
  entropyRatio: number;
  R: number;

  auHash: string;

  rotationCount?: number;
};
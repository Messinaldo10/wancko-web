// lib/auhash/state.ts
import type { ContextDecision, ContextTorBias, ContextEngineBias } from "./context";

export type AUContextState = {
  tMs: number;

  dominance: ContextDecision;
  tor: ContextTorBias;
  engine: ContextEngineBias;

  alignmentScore: number;     // Ψ
  entropyRaw: number;         // 0..999999
  entropyRatio: number;       // 0..1

  // Derivadas estables (para continuidad física)
  R_s: number;                // R suavizada (por min)
  T_s: number;                // T suavizada (por min^2)

  // opcional: para debug / compat
  R?: number;
  T?: number;

  auHash: string;

  rotationCount?: number;
};
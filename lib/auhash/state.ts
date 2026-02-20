// lib/auhash/state.ts

import type { ContextDecision, ContextTorBias, ContextEngineBias } from "./context";

export type AUContextState = {
  // timestamp
  tMs: number;

  /* =========================================================
     Snapshots estructurales
  ========================================================= */

  dominance: ContextDecision;
  tor: ContextTorBias;
  engine: ContextEngineBias;

  /* =========================================================
     Dinámica temporal (Ψ, R, T base)
  ========================================================= */

  // Ψ
  alignmentScore: number;     // 0..1

  // R = dΨ/dt
  vAlignmentPerMin: number;   // puede ser negativo/positivo

  // Entropía
  entropyRaw: number;         // 0..999999
  entropyRatio: number;       // 0..1

  /* =========================================================
     Hash evolutivo
  ========================================================= */

  auHash: string;

  /* =========================================================
     Opcional
  ========================================================= */

  rotationCount?: number;
};
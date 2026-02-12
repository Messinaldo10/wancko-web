/* =========================================================
   AU_HASH Kernel Types
   Base estructural mínima para Wancko / H-Wancko
========================================================= */

export type Lang = "es" | "ca" | "en";

/* ---------- Topic ---------- */
/*
  g es opcional porque no siempre existe.
  Esto evita el error exactOptionalPropertyTypes.
*/
export type AUHashTopic = {
  w: number;        // weight 0..1
  last: number;     // timestamp
  g?: number[];     // glifos opcionales
};

/* ---------- Memory ---------- */

export type AUHashMemory = {
  topics: Record<string, AUHashTopic>;
  langVotes: Record<Lang, number>;
};

/* ---------- State ---------- */

export type AUHashState = {
  v: number;
  t0: number;
  t: number;
  memory: AUHashMemory;
};

// lib/auhash/kernel.ts

export type Lang = "es" | "ca" | "en";

export type AUHashTopic = {
  w: number;        // peso 0..1
  last: number;     // timestamp
  token?: string;   // palabra "humana" asociada al hash (para no mostrar "Txxxx")
  domain?: string;  // dominio humano (ej: "identidad", "movimiento", etc.)
  g?: number[];     // opcional (para futuro AU: glifos/gradiente)
};

export type AUHashMemory = {
  topics: Record<string, AUHashTopic>;
  langVotes: Record<Lang, number>;
};

export type AUHashState = {
  v: number;
  t0: number;
  t: number;
  memory: AUHashMemory;
};

// lib/auhash/kernel.ts
export type Lang = "es" | "ca" | "en";

export type AUHashTopic = {
  w: number;      // peso bruto acumulado
  last: number;   // timestamp last seen
  g: number[];    // reservado para geometría AU posterior (siempre array)
  phon: number[]; // vector fonético mínimo (jerarquía sub-palabra)
  domain: string; // dominio semántico humano (tema/lugar/cuerpo/...)
};

export type AUHashMemory = {
  topics: Record<string, AUHashTopic>;
  langVotes: Record<Lang, number>;
  meta: {
    lastPicked?: string; // para anti-dominancia
    stuckCount: number;  // contador si se repite el mismo pick
    topHistory: Array<{ t: number; token: string }>; // estabilidad para beauty
  };
};

export type AUHashState = {
  v: 2;
  t0: number;
  t: number;
  memory: AUHashMemory;
};

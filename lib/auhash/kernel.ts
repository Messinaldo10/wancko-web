// lib/auhash/kernel.ts
export type EntropicLevel = "1e6" | "1e12" | "1e18" | "1e36";

export type EntropicFrame = {
  level: EntropicLevel;
};


export type Lang = "es" | "ca" | "en";

/** Un “glifo” mínimo (por ahora numérico) */
export type AUGlyph = number;

/** Evento causal TOR: no se borra, se suspende/activa */
export type TorEvent = {
  t: number;
timestamp: number;
  mode: "wancko" | "hwancko";
  action: "hash" | "nohash" | "suspend" | "activate" | "release" | "hold";
  token?: string;       // prestado (solo para lectura humana, no es “verdad”)
  key?: string;         // hash estable
  domain: string;
  causes: string[];     // causas (tokens/keys) que empujaron
  effects: string[];    // efectos (p.ej. “tone=amber”, “anti=silence”)
  suspended?: boolean;
};

export type AUHashTopic = {
  /** peso (relevancia base) */
  w: number;
  /** última vez que se tocó */
  last: number;

  /** glifo fonético jerárquico (provisional): números que codifican composición */
  phon: AUGlyph[];

  /** dominio semántico humano */
  domain: string;

  /** “grain” extra (reservado a futuro) */
  g: AUGlyph[];

  /** si está suspendido, no compite como top */
  suspendedUntil: number; // 0 si no
};

export type AUHashMemory = {
  topics: Record<string, AUHashTopic>;
  langVotes: Record<Lang, number>;

  /** meta-TOR (no es memoria “de palabras”, es dinámica + causalidad) */
  meta: {
    stuckCount: number;
    lastPickedKey: string | null;
    topHistory: { t: number; key: string; token?: string; domain: string }[];
    events: TorEvent[];
  };
};

export type AUHashState = {
  v: 2;
  t0: number;
  t: number;
  memory: AUHashMemory;
frame: EntropicFrame;

};

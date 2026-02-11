export type Lang = "es" | "ca" | "en";

export type AUHashTopic = {
  w: number;      // weight (0..1)
  last: number;   // timestamp ms
  g?: number[];   // glyph ids
};

export type AUHashMemory = {
  topics: Record<string, AUHashTopic>;
  langVotes: Record<Lang, number>;
};

export type AUHashState = {
  v: number;
  t0: number;            // created at
  t: number;             // updated at
  memory: AUHashMemory;
};

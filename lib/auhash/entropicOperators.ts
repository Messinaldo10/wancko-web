// lib/auhash/entropicOperators.ts

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Mezcla entropía-acotada.
 * - conditionStrength: 0..1 (qué tan “clara” es la condición)
 * - entropyRatio: 0..1 (más entropía => menos decisión dura => más 0.5)
 * Devuelve pesos wTrue, wFalse que suman 1.
 */
export function entropicMixWeights(args: {
  conditionStrength: number; // 0..1
  entropyRatio: number;      // 0..1
  sharpness?: number;        // default 6
}) {
  const s = clamp01(args.conditionStrength);
  const e = clamp01(args.entropyRatio);

  // Entropía alta => temperatura alta => decisión más suave
  const sharp = (args.sharpness ?? 6) * (1 - e); // e=1 => sharp=0
  const centered = (s - 0.5) * 2;               // -1..1
  const wTrue = sigmoid(centered * sharp);

  // Si sharp=0 => wTrue=0.5 (equilibrio forzado)
  const wT = clamp01(wTrue);
  const wF = 1 - wT;

  return { wTrue: wT, wFalse: wF };
}

/**
 * Aplica “IF” como mezcla: out = w*ifTrue + (1-w)*ifFalse
 */
export function entropicIfBlend(args: {
  ifTrue: number;
  ifFalse: number;
  conditionStrength: number; // 0..1
  entropyRatio: number;      // 0..1
}) {
  const { wTrue, wFalse } = entropicMixWeights({
    conditionStrength: args.conditionStrength,
    entropyRatio: args.entropyRatio,
  });
  return wTrue * args.ifTrue + wFalse * args.ifFalse;
}

/**
 * Pares multiplicativos recíprocos:
 * - up = exp(+k*s), down = exp(-k*s) = 1/up
 * - s se limita por entropía: entropía alta => |s| menor
 * - media geométrica = 1 siempre
 */
export function entropicReciprocalMultipliers(args: {
  signal: number;       // -1..1 (dirección y magnitud)
  entropyRatio: number; // 0..1
  maxK?: number;        // default 0.35 (amplitud máxima)
}) {
  const e = clamp01(args.entropyRatio);
  const s = Math.max(-1, Math.min(1, args.signal));

  // Entropía limita amplitud: e=1 => k=0, e=0 => k=maxK
  const k = (args.maxK ?? 0.35) * (1 - e);

  const up = Math.exp(k * s);
  const down = 1 / up;

  return { up, down, k };
}
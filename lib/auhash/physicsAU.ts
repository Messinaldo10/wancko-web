// lib/auhash/physicsAU.ts

export type AUPhysicsPrev = {
  R_s?: number; // R suavizada previa
  T_s?: number; // T suavizada previa
};

export type AUPhysicsInput = {
  Psi: number;              // 0..1
  dPsi: number;             // delta Psi
  dtMs: number;             // >= 1
  entropyRatio: number;     // 0..1
  Omega_SO: number;         // 0..1
  sesgo: number;            // 0..1
  prev?: AUPhysicsPrev | null;
};

export type AUPhysicsOutput = {
  Psi: number;
  R: number;                // R estable (por min)
  T: number;                // T estable (por min^2)
  PAU: number;              // 0..1 (propulsión estable y amortiguada)
  NAU: {
    Psi: number;
    R: number;
    T: number;
    magnitude: number;      // 0..1
    phase: number;          // 0..1
  };

  // debug útil
  raw: {
    dtMin: number;
    R_raw: number;
    T_raw: number;
    alphaR: number;
    alphaT: number;
    Tmax: number;
    jerkMax: number;
    damping: number;
  };

  nextPrev: {
    R_s: number;
    T_s: number;
  };
};

function clamp(x: number, lo: number, hi: number) {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number) {
  return clamp(x, 0, 1);
}
function tanh(x: number) {
  const e2x = Math.exp(2 * x);
  return (e2x - 1) / (e2x + 1);
}
function ema(prev: number, x: number, alpha: number) {
  return alpha * x + (1 - alpha) * prev;
}

export function computePhysicsAU(input: AUPhysicsInput): AUPhysicsOutput {
  const Psi = clamp01(input.Psi);

  const dtMin = Math.max(1e-6, input.dtMs / 60000);

  // Derivadas "crudas" (matemáticamente correctas, pero inestables)
  const R_raw = input.dPsi / dtMin;

  // Alphas adaptativos: a más entropía/sesgo, más suavizado (menor alpha)
  const e = clamp01(input.entropyRatio);
  const s = clamp01(input.sesgo);
  const alphaR = clamp(0.22 - 0.10 * e - 0.06 * s, 0.06, 0.28);
  const alphaT = clamp(0.18 - 0.10 * e - 0.06 * s, 0.05, 0.25);

  const prevR = input.prev?.R_s ?? R_raw;
  const R_s = ema(prevR, R_raw, alphaR);

  const T_raw = (R_s - prevR) / dtMin;

  // Límite de aceleración Tmax: cuanto más entropía, menos permites
  // y cuanto más sesgo/Ω, menos permites (evita “acelerar mal”).
  const omega = clamp01(input.Omega_SO);
  const TmaxBase = 6.0; // min^-2 (ajustable)
  const Tmax = Math.max(0.6, TmaxBase * (1 - 0.65 * e) * (1 - 0.45 * s) * (1 - 0.35 * omega));

  const T_clamped = clamp(T_raw, -Tmax, Tmax);

  // Jerk limit (suaviza cambios bruscos de T incluso tras clamp)
  const prevT = input.prev?.T_s ?? T_clamped;
  const jerkMax = Math.max(0.4, 8.0 * (1 - 0.6 * e)); // min^-3 (aprox)
  const dT = clamp(T_clamped - prevT, -jerkMax * dtMin, jerkMax * dtMin);
  const T_jerk = prevT + dT;

  const T_s = ema(prevT, T_jerk, alphaT);

  // Normalización suave para fase/norma
  const Rn = tanh(R_s * 0.9);     // -1..1
  const Tn = tanh(T_s * 0.25);    // -1..1 (más conservador)
  const magnitude = clamp01(Math.sqrt(Psi * Psi + 0.20 * Rn * Rn + 0.12 * Tn * Tn));
  const phase = clamp01((Math.atan2(Rn + 0.6 * Tn, Psi + 1e-9) + Math.PI) / (2 * Math.PI));

  // Propulsión estable: Ψ * gate(R,T) y luego amortiguación por entropía/sesgo/Ω
  const gate = clamp01(0.5 + 0.5 * tanh(1.05 * Rn + 0.95 * Tn));
  let PAU = clamp01(Psi * gate);

  // amortiguación AU (no-ismo): si hay sesgo/entropía, reduces P automáticamente
  const damping = clamp01(0.10 + 0.55 * e + 0.35 * s + 0.20 * omega); // 0..1
  PAU = clamp01(PAU * (1 - damping));

  return {
    Psi,
    R: R_s,
    T: T_s,
    PAU,
    NAU: { Psi, R: R_s, T: T_s, magnitude, phase },
    raw: { dtMin, R_raw, T_raw, alphaR, alphaT, Tmax, jerkMax, damping },
    nextPrev: { R_s, T_s },
  };
}
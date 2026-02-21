// lib/auhash/baskiGuard.ts

export type BaskiGuard = {
  lockPropulsion: boolean;   // si true, P se fuerza a 0 (o casi)
  clampTMax: number;         // techo extra para |T| (min^-2)
  dampExtra: number;         // amortiguación adicional 0..1
  reason: string;
};

function clamp(x: number, lo: number, hi: number) {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
function clamp01(x: number) { return clamp(x, 0, 1); }

export function decideBaskiGuard(args: {
  entropyRatio: number;  // 0..1
  sesgo: number;         // 0..1
  Omega_SO: number;      // 0..1
  Psi: number;           // 0..1
  R: number;             // estable
  T: number;             // estable
}) : BaskiGuard {
  const e = clamp01(args.entropyRatio);
  const s = clamp01(args.sesgo);
  const o = clamp01(args.Omega_SO);
  const psi = clamp01(args.Psi);

  // zonas de riesgo (ajustables)
  const danger = (0.55 * e + 0.35 * s + 0.25 * o) - (0.20 * psi);

  // clamp extra para T
  const clampTMax = Math.max(0.8, 5.0 * (1 - 0.7 * e) * (1 - 0.55 * s));

  // lock propulsión si la dinámica es peligrosa: alta entropía+sesgo o caída rápida
  const fallingHard = args.R < -0.6 && e > 0.65;
  const lockPropulsion = danger > 0.72 || fallingHard;

  const dampExtra = clamp01(Math.max(0, danger - 0.45)); // 0..1, suave

  const reason =
    lockPropulsion
      ? `Baski lock: danger=${danger.toFixed(2)} (e=${e.toFixed(2)} s=${s.toFixed(2)} o=${o.toFixed(2)} psi=${psi.toFixed(2)})`
      : `Baski soft: danger=${danger.toFixed(2)}`;

  return { lockPropulsion, clampTMax, dampExtra, reason };
}
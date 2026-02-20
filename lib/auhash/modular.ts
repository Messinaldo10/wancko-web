// lib/auhash/modular.ts
import { mod } from "./mod"; // asumimos que ya tienes mod(n,m)
import { primaryMetricsFromKey } from "./mod999999";

export const BASE_1E6 = 1_000_000;
export const LIM_999999 = 999_999;

// primarios (factorización 999999 = 3^3 * 7 * 11 * 13 * 37)
export const PRIMARIES = [27, 7, 11, 13, 37] as const;
export type PrimaryMod = typeof PRIMARIES[number];

export type EntropicBase = "1e6" | "999999" | "both";

export type ResidueVector = {
  m27: number;
  m7: number;
  m11: number;
  m13: number;
  m37: number;
};

export type ModularBundle = {
  base: EntropicBase;

  // lineal (para UI / bloques / carry)
  x1e6: number;      // 0..999999
  // cíclico red N (para coherencia interna)
  x999999: number;   // 0..999998

  residues: ResidueVector; // vector CRT primario
};

/* =========================================================
   Core conversions
========================================================= */

// 10^6 lineal -> 999999 cíclico
export function projectTo999999(x1e6: number): number {
  // En Red N: P(x)=x mod (10^6-1)
  return mod(x1e6, LIM_999999);
}

// 999999 -> 10^6 (no es inversa única). Elegimos representación canónica.
export function liftTo1e6(x999999: number): number {
  // canónico: mismo número si está en rango [0..999998], y si es 999998 etc.
  // Nota: 999999 (equivalente a 0 en mod 999999) NO existe como residuo.
  return mod(x999999, LIM_999999);
}

// vector CRT primario
export function residuesFrom999999(x999999: number): ResidueVector {
  const x = mod(x999999, LIM_999999);
  return {
    m27: mod(x, 27),
    m7: mod(x, 7),
    m11: mod(x, 11),
    m13: mod(x, 13),
    m37: mod(x, 37),
  };
}

export function residuesFrom1e6(x1e6: number): ResidueVector {
  return residuesFrom999999(projectTo999999(x1e6));
}

/* =========================================================
   Bundle builder
========================================================= */

export function buildModularBundleFromKey(key: string, base: EntropicBase = "both"): ModularBundle {
  // key suele ser Tb2c65197 etc. Tomamos hex del tail si existe.
  // Si no, hacemos hash simple determinista de chars.
  const x1e6 = normalizeKeyTo1e6(key);
  const x999999 = projectTo999999(x1e6);

  return {
    base,
    x1e6,
    x999999,
    residues: residuesFrom999999(x999999),
  };
}

export function buildModularBundleFrom1e6(x1e6: number, base: EntropicBase = "both"): ModularBundle {
  const a = mod(x1e6, BASE_1E6);
  const b = projectTo999999(a);
  return { base, x1e6: a, x999999: b, residues: residuesFrom999999(b) };
}

export function buildModularBundleFrom999999(x999999: number, base: EntropicBase = "both"): ModularBundle {
  const b = mod(x999999, LIM_999999);
  const a = liftTo1e6(b);
  return { base, x1e6: a, x999999: b, residues: residuesFrom999999(b) };
}

/* =========================================================
   Primary metrics (frame/tor)
   - reutiliza tu mod999999.ts existente
========================================================= */

export type PrimaryMetrics = {
  dimensional_distance: number; // 0..1
  polarity_gap: number;         // 0..1
  cycle_conflict: number;       // 0..1
};

export function primaryMetricsFromKeyUnified(key: string): PrimaryMetrics {
  // Deja a mod999999 como source-of-truth (no lo duplicamos).
  return primaryMetricsFromKey(key);
}

/* =========================================================
   Helpers: key -> 1e6
========================================================= */

function normalizeKeyTo1e6(key: string): number {
  const s = String(key || "");
  // 1) intenta hex al final tipo Tb2c65197 => 2c65197 (o 65197)
  const m = s.match(/([0-9a-f]{5,})$/i);
  if (m?.[1]) {
    const v = parseInt(m[1].slice(-8), 16); // 32-bit-ish
    return mod(v, BASE_1E6);
  }

  // 2) fallback: hash simple determinista (FNV-ish)
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return mod(h >>> 0, BASE_1E6);
}

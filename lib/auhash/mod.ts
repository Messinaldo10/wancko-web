// lib/auhash/mod.ts

/* =========================================================
   BASES
========================================================= */

export const BASE = 1_000_000;        // 10^6 (lineal)
export const MOD = BASE - 1;         // 999999 (cíclico)

export const PRIMARY_MODS = [27, 7, 11, 13, 37] as const;

export type PrimaryMod = typeof PRIMARY_MODS[number];

export type ResidueVector = Record<PrimaryMod, number>;

/* =========================================================
   MOD EXPORTADO (CLAVE DEL ERROR)
========================================================= */

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/* =========================================================
   Inverso modular
========================================================= */

function egcd(a: number, b: number): [number, number, number] {
  if (b === 0) return [a, 1, 0];
  const [g, x1, y1] = egcd(b, a % b);
  return [g, y1, x1 - Math.floor(a / b) * y1];
}

export function modInv(a: number, m: number): number | null {
  const [g, x] = egcd(a, m);
  if (g !== 1) return null;
  return mod(x, m);
}

/* =========================================================
   Vector de residuos primarios
========================================================= */

export function residueVector(x: number): ResidueVector {
  const value = mod(x, MOD);
  const result = {} as ResidueVector;

  for (const m of PRIMARY_MODS) {
    result[m] = mod(value, m);
  }

  return result;
}

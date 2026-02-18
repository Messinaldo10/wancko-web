// lib/auhash/mod.ts

export const BASE = 1_000_000;
export const MOD = BASE - 1; // 999999

export const PRIMARY_MODS = [27, 7, 11, 13, 37] as const;

export type PrimaryMod = typeof PRIMARY_MODS[number];

export type ResidueVector = Record<PrimaryMod, number>;

/* =========================================================
   Utilidades básicas
========================================================= */

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

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
   Vector de residuos
========================================================= */

export function residueVector(x: number): ResidueVector {
  const result = {} as ResidueVector;

  for (const m of PRIMARY_MODS) {
    result[m] = mod(x, m);
  }

  return result;
}

/* =========================================================
   Distancia estructural entre dos vectores
========================================================= */

export function residueDistance(a: ResidueVector, b: ResidueVector): number {
  let total = 0;

  for (const m of PRIMARY_MODS) {
    const diff = Math.abs(a[m] - b[m]);
    total += diff / m;
  }

  return total / PRIMARY_MODS.length;
}

/* =========================================================
   Aproximación modular dirigida
========================================================= */

export type ModParam = {
  M: number;                 // 999999
  numerator: number;
  denominator: PrimaryMod;
  valueMod: number;
  residues: ResidueVector;
};

export function approximateToPrimary(
  realValue: number,
  preferred?: PrimaryMod
): ModParam {

  const candidates = preferred
    ? [preferred]
    : PRIMARY_MODS;

  let best: ModParam | null = null;
  let bestError = Infinity;

  for (const m of candidates) {
    const numerator = Math.round(realValue * m);
    const inv = modInv(m, MOD);
    if (inv === null) continue;

    const valueMod = mod(numerator * inv, MOD);
    const residues = residueVector(valueMod);

    const approx = numerator / m;
    const error = Math.abs(realValue - approx);

    if (error < bestError) {
      bestError = error;
      best = {
        M: MOD,
        numerator,
        denominator: m,
        valueMod,
        residues,
      };
    }
  }

  if (!best) {
    throw new Error("No modular approximation possible");
  }

  return best;
}

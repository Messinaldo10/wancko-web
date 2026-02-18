// lib/auhash/mod999999.ts
export const MOD_BASE = 999999;

// primarios estructurales: 999999 = 3^3 * 7 * 11 * 13 * 37
export const PRIMES = [27, 7, 11, 13, 37] as const;

export type PrimaryMod = (typeof PRIMES)[number];

export type ResidueProfile = {
  x: number; // 0..999998
  residues: Record<PrimaryMod, number>;
  phases: Record<PrimaryMod, number>; // fase normalizada 0..1 basada en Pisano
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

/** FNV-1a 32-bit, estable en node/edge */
export function hashToInt(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 0..2^32-1
  return h >>> 0;
}

/** mapea key/token a estado cíclico 0..999998 */
export function toCyclicState(keyOrToken: string): number {
  return hashToInt(keyOrToken) % MOD_BASE;
}

/** fibonacci mod m + Pisano period */
function pisanoPeriod(m: number): number {
  // Pisano period exists and is finite; small m here, brute ok
  let prev = 0, curr = 1;
  for (let i = 0; i < m * m + 1; i++) {
    const next = (prev + curr) % m;
    prev = curr;
    curr = next;
    if (prev === 0 && curr === 1) return i + 1;
  }
  return m * m;
}

const PISANO_CACHE = new Map<number, number>();
export function getPisano(m: number): number {
  const cached = PISANO_CACHE.get(m);
  if (cached) return cached;
  const p = pisanoPeriod(m);
  PISANO_CACHE.set(m, p);
  return p;
}

export function profile999999(x: number): ResidueProfile {
  const residues = {} as Record<PrimaryMod, number>;
  const phases = {} as Record<PrimaryMod, number>;

  for (const m of PRIMES) {
    const r = ((x % m) + m) % m;
    residues[m] = r;

    const p = getPisano(m);
    // fase: usamos x como índice de fase; lo normalizamos
    phases[m] = clamp01((x % p) / Math.max(1, p - 1));
  }

  return { x, residues, phases };
}

/** distancia dimensional “real” por ascenso compuesto (27 -> 189 -> 2079 -> 27027 -> 999999) */
export function dimensionalDistance(x: number): number {
  const chain = [27, 27 * 7, 27 * 7 * 11, 27 * 7 * 11 * 13, MOD_BASE];
  const norm: number[] = chain.map((m) => (x % m) / (m - 1));
  let acc = 0;
  for (let i = 1; i < norm.length; i++) acc += Math.abs(norm[i] - norm[i - 1]);
  return clamp01(acc / (norm.length - 1));
}

/** brecha de polaridad: compara perfil con su “contra” (-x mod m) (inversión de coherencia) */
export function polarityGap(x: number): number {
  const p1 = profile999999(x);
  const p2 = profile999999(MOD_BASE - (x % MOD_BASE)); // “-x” en el ciclo

  let acc = 0;
  for (const m of PRIMES) {
    const a = p1.residues[m] / (m - 1);
    const b = p2.residues[m] / (m - 1);
    acc += Math.abs(a - b);
  }
  return clamp01(acc / PRIMES.length);
}

/** conflicto de ciclo: dispersión entre fases Pisano activas */
export function cycleConflict(x: number): number {
  const p = profile999999(x);
  const phs = PRIMES.map((m) => p.phases[m]);

  const mean = phs.reduce((a, b) => a + b, 0) / phs.length;
  const varr = phs.reduce((a, v) => a + (v - mean) * (v - mean), 0) / phs.length;
  const std = Math.sqrt(varr);

  // escalado para 0..1 en práctica (std max ~0.5)
  return clamp01(std * 2.2);
}

/** paquete métrico primario */
export function primaryMetricsFromKey(keyOrToken: string) {
  const x = toCyclicState(keyOrToken);
  return {
    x,
    dimensional_distance: dimensionalDistance(x),
    polarity_gap: polarityGap(x),
    cycle_conflict: cycleConflict(x),
  };
}

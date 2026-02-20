// lib/auhash/baseN.ts

export type BaseNSignature = {
  base: number;
  xModN: number;      // x % N
  noN: number;        // complemento (N - xModN) % N
  torsion: number;    // (xModN * noN) % N  (operador simple)
  phase: number;      // 0..1 fase normalizada
};

function safeInt(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

export function modN(x: number, N: number) {
  const n = Math.max(2, safeInt(N));
  const v = safeInt(x);
  const m = ((v % n) + n) % n;
  return { n, m };
}

// Complemento operativo No-N
export function noN(x: number, N: number) {
  const { n, m } = modN(x, N);
  return (n - m) % n;
}

// “Torsión” operativa: producto modular (usable como marcador de inversión)
export function torsionOp(x: number, N: number) {
  const { n, m } = modN(x, N);
  const nn = (n - m) % n;
  return (m * nn) % n;
}

// Firma Base N compacta para alimentar hash y métricas
export function baseNSignature(x: number, N: number): BaseNSignature {
  const { n, m } = modN(x, N);
  const nn = (n - m) % n;
  const t = (m * nn) % n;
  const phase = n > 0 ? m / n : 0;
  return { base: n, xModN: m, noN: nn, torsion: t, phase };
}

/**
 * Periodicidad tipo Pisano (básica) para series estilo Fibonacci mod M.
 * Esto te da una “huella de ciclo” si la quieres usar.
 */
export function pisanoPeriod(modulus: number, cap = 20000): number {
  const m = Math.max(2, safeInt(modulus));
  let prev = 0, curr = 1;
  for (let i = 0; i < cap; i++) {
    const next = (prev + curr) % m;
    prev = curr;
    curr = next;
    if (prev === 0 && curr === 1) return i + 1;
  }
  return cap; // fallback (no rompe)
}
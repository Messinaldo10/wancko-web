// lib/auhash/matrix4.ts

export type MatrixCell = {
  energy: number;
  information: number;
  matter: number;
  gravity: number;
};

export function computeMatrix4(phase: number): MatrixCell {
  // phase 0..1
  const p = Math.max(0, Math.min(1, phase));

  return {
    energy: p,
    information: 1 - p,
    matter: Math.abs(0.5 - p) * 2,
    gravity: 1 - Math.abs(0.5 - p) * 2,
  };
}
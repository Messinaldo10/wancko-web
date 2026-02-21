// lib/auhash/applyWanckoMode.ts

import type { AUFrameOps } from "./frame";
import type { WanckoMode } from "./wanckoMode";

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Aplica micro-ajustes en opsLive según modo Wancko (C/R/T/P),
 * sin romper tu semántica ni disparar valores.
 *
 * Idea:
 * - C (Coherencia): estabiliza → reduce ruido, centra curvatura, sube resonance suave.
 * - R (Revelación): hace “visible” → sube resonance suave, baja entanglement un poco, baja ruido.
 * - T (Transmutación): cambia marco → inversión suave de resonance/curvature + reacomodo.
 * - P (Propulsión): empuja ejecución → sube entanglement/resonance, baja ruido.
 */
export function applyWanckoMode(args: {
  mode: WanckoMode;
  ops: AUFrameOps;
  entropyRatio: number; // 0..1
  Psi: number;          // 0..1
}): { ops: AUFrameOps; note: string } {
  const { mode } = args;

  const E = clamp01(args.entropyRatio);
  const Psi = clamp01(args.Psi);

  // Intensidad: menos entropía + más coherencia => más capacidad de intervención estable
  // (si entropía alta, intervenimos más suave)
  const strength = clamp01((0.65 * Psi + 0.35 * (1 - E)) * 0.18); // ~0..0.18

  const ops = { ...args.ops };

  // Helpers de ajuste suave
  const soften = (v: number, target: number, k: number) => clamp01(lerp(v, target, k));
  const add = (v: number, delta: number) => clamp01(v + delta);

  // Si la intervención debe ser muy suave (alta entropía), reducimos más aún:
  const k = strength * (0.55 + 0.45 * (1 - E));

  if (mode === "C") {
    // Consolidar: bajar ruido, subir resonance, curvatura hacia 0.5
    ops.noise = soften(ops.noise, 0.20, k);
    ops.resonance = soften(ops.resonance, 0.68, k);
    ops.curvature = soften(ops.curvature, 0.50, k);
    ops.entanglement = soften(ops.entanglement, 0.52, k * 0.6);

    return { ops, note: `C: stabilize(k=${k.toFixed(3)})` };
  }

  if (mode === "R") {
    // Revelar: reduce acoplamiento (entanglement) un poco, baja ruido, sube resonance
    ops.noise = soften(ops.noise, 0.18, k);
    ops.resonance = soften(ops.resonance, 0.72, k);
    ops.entanglement = soften(ops.entanglement, 0.46, k);
    ops.curvature = soften(ops.curvature, 0.48, k * 0.6);

    return { ops, note: `R: reveal(k=${k.toFixed(3)})` };
  }

  if (mode === "T") {
    // Transmutar: inversión suave de fase + amortiguación de ruido
    // (evita saltos brutales)
    const invK = clamp01(k * 0.9);

    ops.resonance = soften(ops.resonance, 1 - ops.resonance, invK);
    ops.curvature = soften(ops.curvature, 1 - ops.curvature, invK);

    ops.noise = soften(ops.noise, 0.22, k);
    ops.entanglement = add(ops.entanglement, k * 0.35);

    return { ops, note: `T: transmute(invK=${invK.toFixed(3)})` };
  }

  // mode === "P"
  ops.entanglement = add(ops.entanglement, k * 0.55);
  ops.resonance = add(ops.resonance, k * 0.45);
  ops.noise = soften(ops.noise, 0.16, k);
  ops.curvature = soften(ops.curvature, 0.55, k * 0.35);

  return { ops, note: `P: propel(k=${k.toFixed(3)})` };
}
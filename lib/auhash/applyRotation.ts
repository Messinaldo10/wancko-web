// lib/auhash/applyRotation.ts

import type { RotationAction } from "./rotation";
import type { AUFrameOps } from "./frame";
import type { ContextDecision } from "./context";

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Multiplicadores recíprocos entropía-acotados
 * - media geométrica = 1
 * - entropía alta => menos amplitud
 */
function entropicReciprocalMultipliers(args: {
  signal: number;       // -1..1
  entropyRatio: number; // 0..1
  maxK?: number;
}) {
  const e = clamp01(args.entropyRatio);
  const s = Math.max(-1, Math.min(1, args.signal));

  const k = (args.maxK ?? 0.45) * (1 - e); // entropía limita amplitud

  const up = Math.exp(k * s);
  const down = 1 / up;

  return { up, down };
}

/**
 * Mezcla suave controlada por entropía
 */
function entropicBlend(a: number, b: number, entropyRatio: number) {
  const e = clamp01(entropyRatio);
  const w = 1 - e; // entropía alta => mezcla equilibrada
  return clamp01(a * w + b * (1 - w));
}

/**
 * ApplyRotation con:
 * - limitación entrópica
 * - multiplicadores recíprocos
 * - portal de fase acotado
 */
export function applyRotation(args: {
  rotation: RotationAction;
  ops: AUFrameOps;
  dominance: ContextDecision;
  entropyRatio: number;
  propulsion: number;   // 🔴 NUEVO
}) {
  const { rotation, ops, dominance, entropyRatio } = args;

  switch (rotation.type) {

    case "ROTATE_CHANNEL":
      return {
        ops,
        dominance: {
          ...dominance,
          channel: rotation.to,
        },
      };

    case "ROTATE_DOMINANCE":
      return {
        ops,
        dominance: {
          ...dominance,
          whoDominates: rotation.to,
        },
      };

    case "PHASE_PORTAL":

      // 🔵 Señal estructural (resonancia vs ruido)
      const signal = clamp01(ops.resonance - ops.noise) * 2 - 1;

const intensity = 0.4 + 0.6 * args.propulsion; // 0.4..1
const { up, down } = entropicReciprocalMultipliers({
  signal,
  entropyRatio,
  maxK: 0.6 * intensity,
});

      if (rotation.mode === "INVERT") {
        // Inversión controlada (no binaria)
        return {
          ops: {
            ...ops,
            resonance: clamp01((1 - ops.resonance) * up),
            curvature: clamp01((1 - ops.curvature) * up),
            noise: clamp01(ops.noise * down),
          },
          dominance,
        };
      }

      // 🔵 TRANS-MUTE (equilibrio adaptativo natural)
      return {
        ops: {
          ...ops,
          noise: entropicBlend(ops.noise * 0.75, ops.noise, entropyRatio),
          entanglement: clamp01(ops.entanglement * up),
          resonance: clamp01(ops.resonance * down + 0.1 * (1 - entropyRatio)),
        },
        dominance,
      };

    default:
      return { ops, dominance };
  }
}
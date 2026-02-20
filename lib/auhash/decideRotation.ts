import type { ContextDecision } from "./context";

export type RotationAction =
  | { type: "NONE"; reason: string }
  | { type: "ROTATE_CHANNEL"; to: "BASE" | "CUMBRE"; reason: string }
  | { type: "ROTATE_DOMINANCE"; to: "SELF" | "CONTEXT" | "META"; reason: string }
  | { type: "PHASE_PORTAL"; mode: "INVERT" | "TRANSMUTE"; reason: string };

export function decideRotation(args: {
  entropyRatio: number;
  dEntropy: number;
  alignmentScore: number;
  dAlignment: number;
  whoDominates: "SELF" | "CONTEXT" | "META";
  channel: "BASE" | "CUMBRE";
  forceRotate: boolean;
  intent: "natural" | "performance";
  UC: number;
  INC: number;
  phase?: number;
  propulsion?: number;
}): RotationAction {

  const {
    entropyRatio,
    dEntropy,
    alignmentScore,
    dAlignment,
    whoDominates,
    channel,
    forceRotate,
    intent,
    phase,
    propulsion = 0.5,
  } = args;

  // 🔴 1. Entropía alta + baja propulsión → transmutación automática
  if (entropyRatio > 0.85 && propulsion < 0.3) {
    return {
      type: "PHASE_PORTAL",
      mode: "TRANSMUTE",
      reason: "High entropy collapse prevention",
    };
  }

  // 🔵 2. Intent performance → preferir CUMBRE
  if (intent === "performance" && channel !== "CUMBRE") {
    return {
      type: "ROTATE_CHANNEL",
      to: "CUMBRE",
      reason: "Performance intent prefers CUMBRE",
    };
  }

  // 🔵 3. Fase influye en estructura
  if (phase !== undefined) {
    if (phase > 0.75 && whoDominates !== "META") {
      return {
        type: "ROTATE_DOMINANCE",
        to: "META",
        reason: "High phase stabilizes to META",
      };
    }
  }

  // 🔵 4. Fuerza rotación por conflicto
  if (forceRotate) {
    return {
      type: "PHASE_PORTAL",
      mode: "INVERT",
      reason: "Force rotate by conflict",
    };
  }

  return {
    type: "NONE",
    reason: "Stable",
  };
}
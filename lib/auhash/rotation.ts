// lib/auhash/rotation.ts

export type RotationAction =
  | { type: "NONE"; reason: string }
  | { type: "ROTATE_CHANNEL"; to: "CUMBRE" | "BASE"; reason: string }
  | { type: "ROTATE_DOMINANCE"; to: "SELF" | "CONTEXT" | "META"; reason: string }
  | { type: "PHASE_PORTAL"; mode: "INVERT" | "TRANS-MUTE"; reason: string };

export function decideRotation(args: {
  entropyRatio: number;          // 0..1
  dEntropy?: number;             // raw delta
  alignmentScore: number;        // 0..1
  dAlignment?: number;           // delta
  whoDominates: "SELF" | "CONTEXT" | "META";
  channel: "CUMBRE" | "BASE";
  forceRotate: boolean;
  intent: "natural" | "performance";
  UC: number; INC: number;
}): RotationAction {
  const e = Math.max(0, Math.min(1, args.entropyRatio));
  const dA = args.dAlignment ?? 0;
  const dE = args.dEntropy ?? 0;

  // Umbrales: suaves pero operativos
  const highEntropy = e > 0.72;
  const risingEntropy = dE > 35000;     // ~3.5% del rango total
  const alignmentFalling = dA < -0.06;

  // Portal cuando hay bloqueo + entropía alta (o subiendo) + caída de alineamiento
  if ((highEntropy && alignmentFalling) || (risingEntropy && alignmentFalling) || args.forceRotate) {
    // Natural: transmutación controlada (menos agresivo)
    if (args.intent === "natural") {
      return { type: "PHASE_PORTAL", mode: "TRANS-MUTE", reason: "High/rising entropy + falling alignment (natural)" };
    }
    // Performance: inversión (más agresivo)
    return { type: "PHASE_PORTAL", mode: "INVERT", reason: "High/rising entropy + falling alignment (performance)" };
  }

  // Rotación de canal si hay mismatch con intención
  if (args.intent === "performance" && args.channel !== "CUMBRE") {
    return { type: "ROTATE_CHANNEL", to: "CUMBRE", reason: "Performance intent prefers CUMBRE" };
  }
  if (args.intent === "natural" && args.channel !== "BASE" && args.UC < 0.65) {
    return { type: "ROTATE_CHANNEL", to: "BASE", reason: "Natural intent prefers BASE unless UC high" };
  }

  // Rotación de dominancia si UC alto pide META o INC alto pide contención
  if (args.UC > 0.78 && args.whoDominates !== "META") {
    return { type: "ROTATE_DOMINANCE", to: "META", reason: "UC high requests META stabilization" };
  }
  if (args.INC > 0.75 && args.whoDominates === "SELF") {
    return { type: "ROTATE_DOMINANCE", to: "META", reason: "INC high: avoid SELF hard-lock" };
  }

  return { type: "NONE", reason: "No rotation needed" };
}
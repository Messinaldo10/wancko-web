// lib/auhash/tantra.ts

export type TantraBias = "favorable" | "neutral" | "contrario" | "sesgado";

export type TantraConfig = {
  bias: TantraBias;
  intensity: number; // 0..1
};

export function applyTantraCycle(
  cycle: number,
  base: number
) {
  const phase = Math.sin(cycle * Math.PI * 2);
  return base + phase * 0.1;
}

export function applyTantraToDecision(
  d: number,
  dominance: number,
  silenceRatio: number,
  config: TantraConfig
) {
  let d2 = d;

  if (config.bias === "favorable") {
    d2 += 0.1 * config.intensity;
  }

  if (config.bias === "contrario") {
    d2 -= 0.1 * config.intensity;
  }

  if (config.bias === "sesgado") {
    d2 += (dominance - silenceRatio) * 0.15 * config.intensity;
  }

  d2 = Math.max(0, Math.min(1, d2));

  return {
    d: d2,
    shift: d2 - d,
  };
}

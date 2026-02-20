// lib/auhash/hash.ts

import type { BaseNSignature } from "./baseN";

export type AUHashInput = {
  tMs: number;
  intent: "natural" | "performance";
  // consciencias
  ICH: number; CSC: number; UC: number; INC: number;
  // scalars
  alignmentScore: number; // 0..1
  entropyRaw: number;     // 0..999999
  // firma baseN
  sig?: BaseNSignature;
  // rotación / canal
  whoDominates: "SELF" | "CONTEXT" | "META";
  channel: "CUMBRE" | "BASE";
};

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// FNV-1a 32-bit (simple, estable, sin deps)
function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // hex 8 chars
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Gradiente logarítmico del yo:
 * - sube cuando alignmentScore sube y entropía baja
 * - regulado por UC
 * - INC añade “rugosidad” (micro-perturbación)
 *
 * No es “identity claim”, es scalar computable 0..1.
 */
export function computeYoGradientLog(input: AUHashInput): number {
  const a = clamp01(input.alignmentScore);
  const e = Math.max(0, Math.min(999999, Math.round(input.entropyRaw)));

  const eRatio = e / 999999;
  const UC = clamp01(input.UC);
  const INC = clamp01(input.INC);

  // log(1 + k*(a - e)) normalizado
  const k = 6; // sensibilidad
  const x = (a - eRatio);          // -1..1
  const logi = Math.log1p(Math.max(0, k * (x + 1) / 2)); // 0..log1p(k)
  const base = logi / Math.log1p(k);                    // 0..1

  // regulación y rugosidad
  const regulated = clamp01(base * (0.65 + 0.35 * UC) - 0.15 * INC);
  return regulated;
}

export function computeAUHash(input: AUHashInput): { auHash: string; yoGrad: number; hashMaterial: string } {
  const yoGrad = computeYoGradientLog(input);

  const sigPart = input.sig
    ? `N${input.sig.base}:${input.sig.xModN}/${input.sig.noN}:${input.sig.torsion}:${input.sig.phase.toFixed(4)}`
    : `N?:-`;

  const material =
    [
      `t=${Math.floor(input.tMs / 1000)}`, // segundos: estabilidad y evolución
      `intent=${input.intent}`,
      `dom=${input.whoDominates}`,
      `ch=${input.channel}`,
      `aw=${clamp01(input.ICH).toFixed(3)},${clamp01(input.CSC).toFixed(3)},${clamp01(input.UC).toFixed(3)},${clamp01(input.INC).toFixed(3)}`,
      `A=${clamp01(input.alignmentScore).toFixed(4)}`,
      `E=${Math.max(0, Math.min(999999, input.entropyRaw))}`,
      `yo=${yoGrad.toFixed(4)}`,
      sigPart,
    ].join("|");

  const auHash = `AU-${fnv1a32(material)}-${fnv1a32(material + "|v2")}`;
  return { auHash, yoGrad, hashMaterial: material };
}
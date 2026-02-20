// lib/auhash/entropy.ts

export type EntropyResult = {
  raw: number;     // 0..999999
  ratio: number;   // 0..1
  explain: string;
};

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function computeEntropy999999(args: {
  dd: number; pg: number; cc: number;
  ent: number; res: number; curv: number; noise: number;
  ICH: number; CSC: number; UC: number; INC: number;
  biasHold: number; biasRelease: number; biasSilence: number;
}) : EntropyResult {
  const dd = clamp01(args.dd);
  const pg = clamp01(args.pg);
  const cc = clamp01(args.cc);
  const noise = clamp01(args.noise);
  const curv = clamp01(args.curv);
  const ent = clamp01(args.ent);
  const res = clamp01(args.res);

  const ICH = clamp01(args.ICH);
  const CSC = clamp01(args.CSC);
  const UC  = clamp01(args.UC);
  const INC = clamp01(args.INC);

  const hold = clamp01(args.biasHold);
  const rel  = clamp01(args.biasRelease);
  const sil  = clamp01(args.biasSilence);

  // 🔧 Núcleo: conflicto + distancia + ruido + curvatura
  // + latencia INC (sube entropía) - UC (regula, baja entropía)
  // + desequilibrio de control (hold alto y release bajo)
  const core =
    0.22 * dd +
    0.20 * pg +
    0.26 * cc +
    0.18 * noise +
    0.14 * curv;

  const latent = 0.20 * INC;
  const universalReg = 0.22 * UC;

  const controlImbalance =
    0.12 * hold +
    0.08 * (1 - rel) +
    0.06 * sil;

  // Actividad acoplada (ent/res): cuando hay mucho entanglement sin resonance -> sube.
  const coupling = 0.10 * ent + 0.10 * (1 - res);

  // Tensión masa/singularidad (|ICH - CSC|)
  const massSingularity = 0.12 * Math.abs(ICH - CSC);

  const ratio = clamp01(core + latent + controlImbalance + coupling + massSingularity - universalReg);

  const raw = Math.max(0, Math.min(999999, Math.round(ratio * 999999)));

  return {
    raw,
    ratio,
    explain:
      `E=${raw}/999999 r=${ratio.toFixed(3)} ` +
      `(dd=${dd.toFixed(2)} pg=${pg.toFixed(2)} cc=${cc.toFixed(2)} n=${noise.toFixed(2)} curv=${curv.toFixed(2)} ` +
      `INC=${INC.toFixed(2)} UC=${UC.toFixed(2)} hold=${hold.toFixed(2)} rel=${rel.toFixed(2)} sil=${sil.toFixed(2)} ent=${ent.toFixed(2)} res=${res.toFixed(2)})`,
  };
}
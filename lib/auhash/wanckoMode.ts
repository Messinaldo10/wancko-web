// lib/auhash/wanckoMode.ts

export type WanckoMode = "C" | "R" | "T" | "P";

export type WanckoDecision = {
  mode: WanckoMode;
  label: "Coherencia" | "Revelación" | "Transmutación" | "Propulsión";
  reason: string;
  weights: { C: number; R: number; T: number; P: number };
};

export type Cell16 = {
  domain: "E" | "I" | "M" | "G";
  state: "A" | "B" | "C" | "D";
  code: string;
};

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pickMax(w: WanckoDecision["weights"]): WanckoMode {
  let best: WanckoMode = "C";
  let bestV = -1;

  (Object.keys(w) as WanckoMode[]).forEach((k) => {
    if (w[k] > bestV) {
      bestV = w[k];
      best = k;
    }
  });

  return best;
}

export function decideWanckoMode(args: {
  intent: "natural" | "performance";
  entropyRatio: number;
  Psi: number;
  R: number;
  T: number;
  Omega_SO: number;
  juicio: number;
  sesgo: number;
  cell: Cell16;
  baskiLock?: boolean; // 🔥 correctamente tipado
}): WanckoDecision {

  const {
    intent,
    entropyRatio,
    Psi,
    R,
    T,
    juicio,
    sesgo,
    cell,
    baskiLock,
  } = args;

  // 🔥 BASKI OVERRIDE (gobernanza fuerte)
  if (baskiLock) {
    return {
      mode: "R",
      label: "Revelación",
      reason: "Baski governance lock active",
      weights: { C: 0, R: 1, T: 0, P: 0 },
    };
  }

  const E = clamp01(entropyRatio);
  const PsiClamped = clamp01(Psi);
  const juicioClamped = clamp01(juicio);
  const sesgoClamped = clamp01(sesgo);

  const absR = Math.abs(R);
  const absT = Math.abs(T);

  const w = { C: 0.25, R: 0.25, T: 0.25, P: 0.25 };

  // -------------------------
  // Estado A/B/C/D
  // -------------------------
  if (cell.state === "A") {
    w.P += 0.20; w.C += 0.10; w.R -= 0.10;
  }
  else if (cell.state === "B") {
    w.R += 0.25; w.T += 0.10; w.P -= 0.20;
  }
  else if (cell.state === "C") {
    w.C += 0.25; w.P -= 0.10;
  }
  else if (cell.state === "D") {
    w.T += 0.30; w.R += 0.05; w.C -= 0.10;
  }

  // -------------------------
  // Dominio E/I/M/G
  // -------------------------
  if (cell.domain === "E") { w.C += 0.05; w.R += 0.05; }
  if (cell.domain === "I") { w.R += 0.08; w.P += 0.05; }
  if (cell.domain === "M") { w.P += 0.08; w.T += 0.05; }
  if (cell.domain === "G") { w.T += 0.08; w.C += 0.05; }

  // -------------------------
  // Señales dinámicas
  // -------------------------
  if (E > 0.70) { w.P -= 0.25; w.R += 0.10; w.T += 0.10; }

  if (PsiClamped < 0.55) { w.R += 0.20; w.P -= 0.10; }

  if (PsiClamped > 0.70 && juicioClamped > 0.65) {
    w.P += 0.20; w.C += 0.10; w.R -= 0.10;
  }

  if (sesgoClamped > 0.65) { w.R += 0.20; w.P -= 0.10; }

  if (sesgoClamped > 0.65 && absT > 0.4) { w.T += 0.15; }

  if (absT > 0.8) { w.T += 0.25; w.C -= 0.05; }

  // -------------------------
  // Intent
  // -------------------------
  if (intent === "natural") {
    w.C += 0.12; w.R += 0.10; w.P -= 0.08;
  }

  if (intent === "performance") {
    w.P += 0.10; w.T += 0.08; w.C -= 0.05;
  }

  (Object.keys(w) as (keyof typeof w)[]).forEach(
    (k) => (w[k] = clamp01(w[k]))
  );

  const mode = pickMax(w);

  const label =
    mode === "C" ? "Coherencia" :
    mode === "R" ? "Revelación" :
    mode === "T" ? "Transmutación" :
    "Propulsión";

  const reason =
    `cell=${cell.code} intent=${intent} Ψ=${PsiClamped.toFixed(2)} ` +
    `E=${E.toFixed(2)} juicio=${juicioClamped.toFixed(2)} ` +
    `sesgo=${sesgoClamped.toFixed(2)} |R|=${absR.toFixed(2)} |T|=${absT.toFixed(2)}`;

  return { mode, label, reason, weights: w };
}
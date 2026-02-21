// lib/auhash/wanckoMode.ts

export type WanckoMode = "C" | "R" | "T" | "P";

export type WanckoDecision = {
  mode: WanckoMode;
  label: "Coherencia" | "Revelación" | "Transmutación" | "Propulsión";
  reason: string;
  weights: { C: number; R: number; T: number; P: number }; // 0..1
};

export type Cell16 = {
  domain: "E" | "I" | "M" | "G";
  state: "A" | "B" | "C" | "D";
  code: string; // "E-A"
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

  // 🔥 AÑADE SOLO ESTA LÍNEA
  baskiLock?: boolean;
})

// 🔥 Al principio de la función
if (args.baskiLock) {
  return {
    mode: "R",
    label: "Baski Override",
    reason: "Governance lock active",
    weights: {},
  };
}

}): WanckoDecision {
  const { intent, cell } = args;

  const E = clamp01(args.entropyRatio);
  const Psi = clamp01(args.Psi);
  const juicio = clamp01(args.juicio);
  const sesgo = clamp01(args.sesgo);

  const absR = Math.abs(args.R);
  const absT = Math.abs(args.T);

  // Heurísticas base (sin épica):
  // - C: cuando hay estabilidad y conviene consolidar
  // - R: cuando hay sesgo o caída de coherencia: hacer visible sin forzar
  // - T: cuando el sistema acelera mal o necesita invertir marco (D o T alta)
  // - P: cuando hay coherencia suficiente y juicio para empujar

  // Pesos iniciales por celda (E/I/M/G × A/B/C/D)
  const w = { C: 0.25, R: 0.25, T: 0.25, P: 0.25 };

  // Estados A/B/C/D pesan el modo
  if (cell.state === "A") {
    w.P += 0.20; w.C += 0.10; w.R -= 0.10;
  } else if (cell.state === "B") {
    w.R += 0.25; w.T += 0.10; w.P -= 0.20;
  } else if (cell.state === "C") {
    w.C += 0.25; w.P -= 0.10;
  } else if (cell.state === "D") {
    w.T += 0.30; w.R += 0.05; w.C -= 0.10;
  }

  // Dominio E/I/M/G modula estilo del modo
  // (no cambia el modo por sí solo, pero empuja)
  if (cell.domain === "E") { w.C += 0.05; w.R += 0.05; }
  if (cell.domain === "I") { w.R += 0.08; w.P += 0.05; }
  if (cell.domain === "M") { w.P += 0.08; w.T += 0.05; }
  if (cell.domain === "G") { w.T += 0.08; w.C += 0.05; }

  // Señales dinámicas
  // Entropía alta frena P y empuja R/T
  if (E > 0.70) { w.P -= 0.25; w.R += 0.10; w.T += 0.10; }
  // Coherencia baja empuja R
  if (Psi < 0.55) { w.R += 0.20; w.P -= 0.10; }
  // Coherencia alta + juicio alto habilita P/C
  if (Psi > 0.70 && juicio > 0.65) { w.P += 0.20; w.C += 0.10; w.R -= 0.10; }
  // Sesgo alto empuja R, y si además absT alto empuja T
  if (sesgo > 0.65) { w.R += 0.20; w.P -= 0.10; }
  if (sesgo > 0.65 && absT > 0.4) { w.T += 0.15; }

  // Si T fuerte → transmutación (evita que T “se pierda”)
  if (absT > 0.8) { w.T += 0.25; w.C -= 0.05; }

  // Intent: natural favorece C/R; performance favorece P/T
  if (intent === "natural") { w.C += 0.12; w.R += 0.10; w.P -= 0.08; }
  if (intent === "performance") { w.P += 0.10; w.T += 0.08; w.C -= 0.05; }

  // Normaliza 0..1 por clamp (no hace suma=1; nos basta comparativa)
  (Object.keys(w) as (keyof typeof w)[]).forEach((k) => (w[k] = clamp01(w[k])));

  const mode = pickMax(w);

  const label =
    mode === "C" ? "Coherencia" :
    mode === "R" ? "Revelación" :
    mode === "T" ? "Transmutación" :
    "Propulsión";

  const reason =
    `cell=${cell.code} intent=${intent} Ψ=${Psi.toFixed(2)} E=${E.toFixed(2)} ` +
    `juicio=${juicio.toFixed(2)} sesgo=${sesgo.toFixed(2)} |R|=${absR.toFixed(2)} |T|=${absT.toFixed(2)}`;

  return { mode, label, reason, weights: w };
}
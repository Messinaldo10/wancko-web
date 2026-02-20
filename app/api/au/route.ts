import { NextResponse } from "next/server";
import { AUEngineRunner } from "../../../lib/auhash/engineRunner";

const runner = new AUEngineRunner({
  entanglement: 0.5,
  resonance: 0.6,
  curvature: 0.4,
  noise: 0.2,
  duality: 0.5,
  derivatives: {
    d1: 0,
    W1: 0,
    attach1: 0,
  },
});

export async function GET(request: Request) {

  const { searchParams } = new URL(request.url);

  // 🔵 Inputs dinámicos
  const perturb = Number(searchParams.get("perturb") ?? 0);
  const intent = (searchParams.get("intent") ?? "performance") as
    | "natural"
    | "performance";

  const result = runner.tick({
    frame: {} as any,
    metrics: {
      dimensional_distance: 0.3 + perturb,
      polarity_gap: 0.2,
      cycle_conflict: 0.1,
    },
    intent,
  });

  return NextResponse.json({
    ...result,
    meta: {
      note: "AU Engine live",
      timestamp: Date.now(),
    },
  });
}
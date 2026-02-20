import { AUEngineRunner } from "../../../../lib/auhash/engineRunner";

export const runtime = "nodejs"; // importante para mantener stream estable

const runner = new AUEngineRunner({
  entanglement: 0.5,
  resonance: 0.6,
  curvature: 0.4,
  noise: 0.2,
  duality: 0.5,
  derivatives: { d1: 0, W1: 0, attach1: 0 },
});

function num(v: string | null, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const intent = (searchParams.get("intent") ?? "performance") as
    | "natural"
    | "performance";

  // perturbaciones (puedes mover sliders en el UI)
  const dd = num(searchParams.get("dd"), 0.3);
  const pg = num(searchParams.get("pg"), 0.2);
  const cc = num(searchParams.get("cc"), 0.1);

  const intervalMs = Math.max(50, Math.min(2000, num(searchParams.get("ms"), 250)));

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const timer = setInterval(() => {
        const r = runner.tick({
          frame: {} as any,
          metrics: {
            dimensional_distance: dd,
            polarity_gap: pg,
            cycle_conflict: cc,
          },
          intent,
        });

        const payload = {
          tMs: r.evolution.tMs,
          Psi: r.evolution.dynamics.Psi,
          R: r.evolution.dynamics.R,
          T: r.evolution.dynamics.T,
          P: r.evolution.dynamics.PAU,
          E: r.evolution.entropyRaw,
          Er: r.evolution.entropyRatio,
          phase: r.evolution.dynamics.NAU.phase,
          rot: r.rotation,
          dom: r.dominance,
          m4: r.au.matrix4,
          hash: r.au.auHash,
        };

        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      }, intervalMs);

      // cerrar limpio si el cliente corta
      // @ts-ignore
      req.signal?.addEventListener?.("abort", () => {
        clearInterval(timer);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
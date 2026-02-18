// app/api/wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";
import { applyTor } from "../../../lib/auhash/tor";
import { computeAU, formatHit } from "../../../lib/auhash/engine";
import { evaluateAU } from "../../../lib/auhash/server-au";
import { computeFrameAndOps } from "../../../lib/auhash/frame";
import { primaryMetricsFromKey } from "../../../lib/auhash/mod999999";

type WanckoSession = {
  id: string;
  turns: number;
  lang: Lang;
  silenceCount: number;
  memory: AUHashState;
};

function detectLang(text: string, accept?: string): Lang {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || accept?.startsWith("ca")) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || accept?.startsWith("es")) return "es";
  return "en";
}

function newSession(lang: Lang): WanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    lang,
    silenceCount: 0,
    memory: ensureState(null),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: string = body?.input || "";
    const acceptLang = req.headers.get("accept-language") || undefined;

    const lang = detectLang(input, acceptLang);
    let session: WanckoSession = body?.session || newSession(lang);
    if (!session.lang) session.lang = lang;

    session.turns += 1;

    /* =========================================================
       1️⃣ INGEST
    ========================================================= */

    session.memory = ingestText(session.memory, input, "user", session.lang);

    /* =========================================================
       2️⃣ HITS
    ========================================================= */

    let hits: MemoryHit[] = queryMemory(session.memory, 10);
    const top = hits[0] || null;

    /* =========================================================
       3️⃣ FRAME + PRIMARY METRICS
    ========================================================= */

    const report = evaluateAU(session.memory, hits, session.turns, session.silenceCount);

    const framePack = computeFrameAndOps({
      wReport: report,
      hReport: null,
      wTurns: session.turns,
      hTurns: 0,
      wTopKey: top?.key || top?.token || null,
    });

    const primary = top
      ? primaryMetricsFromKey(top.key || top.token)
      : null;

    /* =========================================================
       4️⃣ CONTEXTO TOR
    ========================================================= */

    const ctx = {
      metrics: {
        dimensional_distance: framePack.metrics.dimensional_distance,
        polarity_gap: framePack.metrics.polarity_gap,
        cycle_conflict: framePack.metrics.cycle_conflict,
      },
      ops: framePack.ops,
    };

    session.memory = applyTor(
      session.memory,
      "wancko",
      hits,
      top?.token,
      ctx
    );

    /* =========================================================
       5️⃣ REFRESH HITS
    ========================================================= */

    hits = queryMemory(session.memory, 10);
    const finalTop = hits[0] || null;

    /* =========================================================
       6️⃣ OUTPUT
    ========================================================= */

    let output: string | null = null;

    if (finalTop) {
      if (session.lang === "ca")
        output = `He detectat coherència en ${formatHit(session.lang, finalTop)}.`;
      else if (session.lang === "en")
        output = `I detect coherence around ${formatHit(session.lang, finalTop)}.`;
      else
        output = `He detectado coherencia en ${formatHit(session.lang, finalTop)}.`;
    }

    // silencio estratégico según frame
    if (
      !output ||
      framePack.metrics.dimensional_distance > 0.75 ||
      framePack.ops.noise > 0.75
    ) {
      session.silenceCount += 1;

      if (session.lang === "ca")
        output = "Què falta perquè això sigui decidible, ara?";
      else if (session.lang === "en")
        output = "What is missing for this to be decidable, now?";
      else
        output = "¿Qué falta para que esto sea decidible, ahora?";
    }

    /* =========================================================
       7️⃣ AU VISUAL
    ========================================================= */

const au = computeAU(
  "wancko",
  hits,
  session.turns,
  session.silenceCount,
  session.lang
);

    return NextResponse.json({
      output,
      session,
      au,
      frame: framePack.frame,
      ops: framePack.ops,
      metrics: framePack.metrics,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "wancko error" }, { status: 500 });
  }
}

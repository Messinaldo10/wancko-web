// app/api/h-wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";
import { applyTor } from "../../../lib/auhash/tor";
import { computeAU, formatHit } from "../../../lib/auhash/engine";
import { evaluateAU } from "../../../lib/auhash/server-au";
import { computeFrameAndOps } from "../../../lib/auhash/frame";
import { primaryMetricsFromKey } from "../../../lib/auhash/mod999999";

type HWanckoSession = {
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

function newSession(lang: Lang): HWanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    lang,
    silenceCount: 0,
    memory: ensureState(null),
  };
}

function msg(lang: Lang, ca: string, en: string, es: string) {
  if (lang === "ca") return ca;
  if (lang === "en") return en;
  return es;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: string = body?.input || "";
    const acceptLang = req.headers.get("accept-language") || undefined;

    const lang = detectLang(input, acceptLang);
    let session: HWanckoSession = body?.session || newSession(lang);
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
      wReport: null,
      hReport: report,
      wTurns: 0,
      hTurns: session.turns,
      hTopKey: top?.key || top?.token || null,
    });

    const ctx = {
      metrics: framePack.metrics,
      ops: framePack.ops,
    };

    /* =========================================================
       4️⃣ APPLY TOR
    ========================================================= */

    session.memory = applyTor(
      session.memory,
      "hwancko",
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
       6️⃣ OUTPUT (ESPEJO)
    ========================================================= */

    let output: string | null = null;

    if (finalTop) {
      output = msg(
        session.lang,
        `Em quedo amb ${formatHit(session.lang, finalTop)}. Quina part és mirall i quina és motor?`,
        `I stay with ${formatHit(session.lang, finalTop)}. Which part is mirror and which is engine?`,
        `Me quedo con ${formatHit(session.lang, finalTop)}. ¿Qué parte es espejo y cuál es motor?`
      );
    }

    if (
      !output ||
      framePack.metrics.polarity_gap > 0.75 ||
      framePack.ops.duality > 0.75
    ) {
      session.silenceCount += 1;

      output = msg(
        session.lang,
        "Què falta perquè això sigui decidible, ara?",
        "What is missing for this to be decidable, now?",
        "¿Qué falta para que esto sea decidible, ahora?"
      );
    }

    /* =========================================================
       7️⃣ AU VISUAL
    ========================================================= */

    const au = computeAU(
  "hwancko",
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
    return NextResponse.json({ error: "h-wancko error" }, { status: 500 });
  }
}

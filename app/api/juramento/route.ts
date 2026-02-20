// app/api/juramento/route.ts

import { NextRequest, NextResponse } from "next/server";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import { queryMemory } from "../../../lib/auhash/minimal";
import type { MemoryHit } from "../../../lib/auhash/minimal";
import { computeAU } from "../../../lib/auhash/engine";
import {
  evaluateAU,
  pickTurmiProfile,
  acceptanceImplication,
} from "../../../lib/auhash/server-au";
import { applyTantraToDecision } from "../../../lib/auhash/tantra";
import { computeFrameAndOps } from "../../../lib/auhash/frame";
import { computeContext } from "../../../lib/auhash/context";

type AnySession = {
  turns?: number;
  silenceCount?: number;
  lang?: Lang;
  memory?: AUHashState;
};

function detectLangFallback(a?: Lang, b?: Lang): Lang {
  return a || b || "es";
}

function recommendMode(w: number, h: number) {
  if (w + 0.12 < h) return "wancko";
  if (h + 0.12 < w) return "hwancko";
  return "both";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const wancko: AnySession | null = body?.wancko || null;
    const hwancko: AnySession | null = body?.hwancko || null;

    const wState: AUHashState | null = body?.wState || wancko?.memory || null;
    const hState: AUHashState | null = body?.hState || hwancko?.memory || null;

    const wTurns = wancko?.turns ?? 0;
    const hTurns = hwancko?.turns ?? 0;

    const wSil = wancko?.silenceCount ?? 0;
    const hSil = hwancko?.silenceCount ?? 0;

    const lang = detectLangFallback(wancko?.lang, hwancko?.lang);

    if (!wState && !hState) {
      return NextResponse.json(
        { error: "juramento: missing wancko/hwancko state" },
        { status: 400 }
      );
    }

    /* =========================================================
       1️⃣ Hits
    ========================================================= */

    const wHits: MemoryHit[] = wState ? queryMemory(wState, 10) : [];
    const hHits: MemoryHit[] = hState ? queryMemory(hState, 10) : [];

    const wTop = wHits[0] || null;
    const hTop = hHits[0] || null;

    /* =========================================================
       2️⃣ Server AU
    ========================================================= */

    const wReport = wState ? evaluateAU(wState, wHits, wTurns, wSil) : null;
    const hReport = hState ? evaluateAU(hState, hHits, hTurns, hSil) : null;

    /* =========================================================
       3️⃣ Visual AU Layer
    ========================================================= */

    const auWancko = wState
      ? computeAU("wancko", wHits, wTurns, wSil, lang)
      : null;

    const auHWancko = hState
      ? computeAU("hwancko", hHits, hTurns, hSil, lang)
      : null;

    /* =========================================================
       4️⃣ Frame + Ops + Metrics
    ========================================================= */

    const framePack = computeFrameAndOps({
      wReport,
      hReport,
      wTurns,
      hTurns,
      wTopKey: wTop?.key || null,
      hTopKey: hTop?.key || null,
    });

    /* =========================================================
       5️⃣ Context Layer (nuevo)
    ========================================================= */

    const intent = body?.intent || "natural"; // natural | performance

    const context = computeContext({
      frame: framePack.frame,
      ops: framePack.ops,
      metrics: framePack.metrics,
      wReport,
      hReport,
      intent,
      contextProfile: body?.contextProfile,
      awareness: body?.awareness,
      affect: body?.affect,
    });

    /* =========================================================
       6️⃣ Tantra
    ========================================================= */

    const tantraConfig = body?.tantra || {
      bias: "neutral",
      intensity: 0.5,
    };

    const tantraWancko =
      wReport && auWancko
        ? applyTantraToDecision(
            wReport.signals.d,
            wReport.signals.dominance,
            wReport.signals.silenceRatio,
            tantraConfig
          )
        : null;

    const tantraHWancko =
      hReport && auHWancko
        ? applyTantraToDecision(
            hReport.signals.d,
            hReport.signals.dominance,
            hReport.signals.silenceRatio,
            tantraConfig
          )
        : null;

    /* =========================================================
       7️⃣ Perfil Turmi
    ========================================================= */

    const wProfile = wReport ? pickTurmiProfile(wReport) : null;
    const hProfile = hReport ? pickTurmiProfile(hReport) : null;

    const recommended = recommendMode(
      wReport?.okScore ?? 0,
      hReport?.okScore ?? 0
    );

    const vector =
      (wReport?.vector ||
        hReport?.vector ||
        "neutral") as "wancko" | "hwancko" | "neutral";

    const profile =
      (recommended === "wancko"
        ? wProfile
        : recommended === "hwancko"
        ? hProfile
        : wProfile || hProfile) || "mito";

    const implication = acceptanceImplication(lang, vector, profile);

    /* =========================================================
       RESPONSE
    ========================================================= */

    return NextResponse.json({
      lang,

      frame: framePack.frame,
      ops: framePack.ops,
      metrics: framePack.metrics,

      context, // 👈 NUEVO

      tantra_effect: {
        wancko: tantraWancko,
        hwancko: tantraHWancko,
      },

      ui: {
        recommendedMode: context.engine.recommendMode,
        exposure: context.engine.exposure,
        implication,
      },

      wancko: wReport
        ? { report: wReport, profile: wProfile, au: auWancko }
        : null,

      hwancko: hReport
        ? { report: hReport, profile: hProfile, au: auHWancko }
        : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "juramento error" },
      { status: 500 }
    );
  }
}

// app/api/h-wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";

import { computeAU, formatHit } from "../../../lib/auhash/engine";
import { evaluateAU } from "../../../lib/auhash/server-au";
import { computeFrameAndOps } from "../../../lib/auhash/frame";
import { decideTor, applyTor } from "../../../lib/auhash/tor";

type HWanckoSession = {
  id: string;
  turns: number;
  lang: Lang;
  chain: string[];
  silenceCount: number;
  memory: AUHashState;
  archetype?: string;
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
    chain: [],
    silenceCount: 0,
    memory: ensureState(null),
    archetype: "estoic",
  };
}

function msg(lang: Lang, ca: string, en: string, es: string) {
  if (lang === "ca") return ca;
  if (lang === "en") return en;
  return es;
}

function decidePrompt(lang: Lang) {
  return msg(
    lang,
    "Què falta perquè això sigui decidible, ara?",
    "What is missing for this to be decidable, now?",
    "¿Qué falta para que esto sea decidible, ahora?"
  );
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
    session.chain = Array.isArray(session.chain) ? session.chain : [];
    session.chain.push(input);
    session.archetype = body?.archetype || session.archetype || "estoic";

    // 1) ingest
    session.memory = ingestText(session.memory, input, "user", session.lang);

    // 2) hits
    let hits: MemoryHit[] = queryMemory(session.memory, 10);

    // 3) frame ctx (macro -> micro)
    const report = evaluateAU(session.memory, hits, session.turns, session.silenceCount);

    const framePack = computeFrameAndOps({
      wReport: null,
      hReport: report,
      wTurns: 0,
      hTurns: session.turns,
      wTopKey: null,
      hTopKey: hits[0]?.key ?? null,
    });

    const ctx = { metrics: framePack.metrics, ops: framePack.ops };

    // 4) decide TOR + apply TOR
    const torDecision = decideTor(session.memory, "hwancko", hits, hits[0]?.token, ctx);
    session.memory = applyTor(session.memory, "hwancko", hits, hits[0]?.token, {
  metrics: framePack.metrics,
  ops: framePack.ops,
});


    // 5) refresh hits
    hits = queryMemory(session.memory, 10);
    const top = hits[0] || null;

    // 6) output espejo
    let output: string | null = null;

    if (!top || torDecision.anti === "silence") {
      session.silenceCount += 1;
      output = decidePrompt(session.lang);
    } else {
      output = msg(
        session.lang,
        `Em quedo amb ${formatHit(session.lang, top)}. Quina part és mirall i quina és motor?`,
        `I stay with ${formatHit(session.lang, top)}. Which part is mirror and which is engine?`,
        `Me quedo con ${formatHit(session.lang, top)}. ¿Qué parte es espejo y cuál es motor?`
      );
    }

    // 7) AU pack
    const au = (computeAU as any)(
      "hwancko",
      hits,
      session.turns,
      session.silenceCount,
      session.lang,
      { pick: top, anti: torDecision.anti ?? null, reason: torDecision.reason }
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

// app/api/wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";

import { computeAU, formatHit } from "../../../lib/auhash/engine";
import { evaluateAU } from "../../../lib/auhash/server-au";
import { computeFrameAndOps } from "../../../lib/auhash/frame";
import { decideTor, applyTor } from "../../../lib/auhash/tor";

type WanckoSession = {
  id: string;
  turns: number;
  lang: Lang;
  chain: string[];
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
    chain: [],
    silenceCount: 0,
    memory: ensureState(null),
  };
}

function decidePrompt(lang: Lang) {
  if (lang === "ca") return "Què falta perquè això sigui decidible, ara?";
  if (lang === "en") return "What is missing for this to be decidable, now?";
  return "¿Qué falta para que esto sea decidible, ahora?";
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
    session.chain = Array.isArray(session.chain) ? session.chain : [];
    session.chain.push(input);

    // 1) ingest
    session.memory = ingestText(session.memory, input, "user", session.lang);

    // 2) hits
    let hits: MemoryHit[] = queryMemory(session.memory, 10);

    // 3) build frame ctx (macro -> micro)
    const report = evaluateAU(session.memory, hits, session.turns, session.silenceCount);

    const framePack = computeFrameAndOps({
      wReport: report,
      hReport: null,
      wTurns: session.turns,
      hTurns: 0,
      wTopKey: hits[0]?.key ?? null,
      hTopKey: null,
    });

    const ctx = { metrics: framePack.metrics, ops: framePack.ops };

    // 4) decide TOR (read-only) + apply TOR (write)
    const torDecision = decideTor(session.memory, "wancko", hits, hits[0]?.token, ctx);
    session.memory = applyTor(session.memory, "wancko", hits, hits[0]?.token, {
  metrics: framePack.metrics,
  ops: framePack.ops,
  });

    // 5) refresh hits
    hits = queryMemory(session.memory, 10);
    const top = hits[0] || null;

    // 6) output
    let output: string | null = null;

    // “silencio estratégico”
    if (!top || torDecision.anti === "silence") {
      session.silenceCount += 1;
      output = decidePrompt(session.lang);
    } else {
      if (session.lang === "ca") output = `He detectat coherència en ${formatHit(session.lang, top)}.`;
      else if (session.lang === "en") output = `I detect coherence around ${formatHit(session.lang, top)}.`;
      else output = `He detectado coherencia en ${formatHit(session.lang, top)}.`;
    }

    // 7) AU pack (si tu engine admite decision opcional, se la pasamos)
    // Si tu computeAU firma solo 5 args, quita el último.
    const au = (computeAU as any)(
      "wancko",
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
    return NextResponse.json({ error: "wancko error" }, { status: 500 });
  }
}

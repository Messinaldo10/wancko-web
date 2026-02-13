// app/api/wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";
import { applyTor } from "../../../lib/auhash/tor";
import { computeAU, formatHit } from "../../../lib/auhash/engine";

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

    // 3) TOR
    const tor = applyTor(session.memory, "wancko", hits, hits[0]?.token);
    session.memory = tor.state;

    // 4) refrescar hits (tras holds/suspends)
    hits = queryMemory(session.memory, 10);

    const top = tor.decision.pick || hits[0] || null;

    // 5) output
    let output: string | null = null;

    if (top) {
      if (session.lang === "ca") output = `He detectat coherència en ${formatHit(session.lang, top)}.`;
      else if (session.lang === "en") output = `I detect coherence around ${formatHit(session.lang, top)}.`;
      else output = `He detectado coherencia en ${formatHit(session.lang, top)}.`;
    }

    // 6) silencio estratégico (solo si TOR lo pide o no hay top real)
    if (!output || tor.decision.anti === "silence") {
      session.silenceCount += 1;
      if (session.lang === "ca") output = "Què falta perquè això sigui decidible, ara?";
      else if (session.lang === "en") output = "What is missing for this to be decidable, now?";
      else output = "¿Qué falta para que esto sea decidible, ahora?";
    }

    // 7) AU
    const au = computeAU(
      "wancko",
      hits,
      session.turns,
      session.silenceCount,
      tor.decision,
      session.lang
    );

    return NextResponse.json({
      output,
      session,
      au,
      cert: null,
      hai: null,
      baski: null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "wancko error" }, { status: 500 });
  }
}

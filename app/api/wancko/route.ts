// app/api/wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";


type WanckoSession = {
  id: string;
  turns: number;
  lang: Lang;
  chain: string[];
  silenceCount: number;
  cycle: {
    band: number;
    ok_live: number;
  };
  memory: AUHashState;
};

function detectLang(text: string, accept?: string): Lang {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t)) return "es";
  if (accept?.startsWith("ca")) return "ca";
  if (accept?.startsWith("es")) return "es";
  return "en";
}

function newSession(lang: Lang): WanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    lang,
    chain: [],
    silenceCount: 0,
    cycle: { band: 1, ok_live: 0.5 },
    memory: ensureState(null),
  };
}

function msg(lang: Lang, es: string, ca: string, en: string) {
  return lang === "ca" ? ca : lang === "en" ? en : es;
}

function formatHit(
  lang: Lang,
  hit: { k: string; w: number; last: number; domain: string }
): string {
  if (lang === "ca")
    return `${hit.k} (domini: ${hit.domain})`;

  if (lang === "en")
    return `${hit.k} (domain: ${hit.domain})`;

  return `${hit.k} (dominio: ${hit.domain})`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const input: string = (body?.input || "").toString();
    const acceptLang = req.headers.get("accept-language") || undefined;

    const detected = detectLang(input, acceptLang);
    const session: WanckoSession = body?.session
      ? {
          ...body.session,
          lang: (body.session.lang || detected) as Lang,
          memory: ensureState(body.session.memory),
        }
      : newSession(detected);

    // turno
    session.turns += 1;
    session.chain = Array.isArray(session.chain) ? session.chain : [];
    session.chain.push(input);

    // ingesta
    session.memory = ingestText(session.memory, input, "user", session.lang);

    // dominio humano
    const hits = queryMemory(session.memory, 6);
    const top = hits[0];

    let output: string | null = null;

    if (top) {
      output = msg(
        session.lang,
        `He detectado coherencia en ${formatHit(session.lang, top)}.`,
        `He detectat coherència en ${formatHit(session.lang, top)}.`,
        `I detect coherence around ${formatHit(session.lang, top)}.`
      );
    }

    // silencio estratégico
    if (!output) {
      session.silenceCount += 1;
      output = msg(
        session.lang,
        "¿Qué falta para que esto sea decidible, ahora?",
        "Què falta perquè això sigui decidible, ara?",
        "What is missing for this to be decidable, now?"
      );
    }

    // Señales AU (todavía simple; Paso 2 las hacemos “de verdad”)
    const ok_live = Math.max(0, Math.min(1, 0.5 + (session.turns - session.silenceCount) * 0.02));
    session.cycle.ok_live = ok_live;

    const au = {
      mode: "wancko",
      screen: "natural",
      matrix: "AU",
      N_level: session.turns,
      signals: {
        d: ok_live,
        W: ok_live,
        band: session.cycle.band,
        ok: ok_live,
        tone: ok_live > 0.6 ? "green" : ok_live < 0.4 ? "red" : "amber",
        // placeholders para el Paso 2:
        complexity: Math.log2(2 + session.turns) / 6,
        beauty: 0.55,
      },
    };

    return NextResponse.json({ output, session, au, cert: null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "wancko error" }, { status: 500 });
  }
}

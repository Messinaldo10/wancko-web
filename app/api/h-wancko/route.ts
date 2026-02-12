// app/api/h-wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";

type HWanckoSession = {
  id: string;
  turns: number;
  lang: Lang;
  chain: string[];
  memory: AUHashState;
  archetype?: string;
};

function detectLang(text: string, accept?: string): Lang {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t)) return "es";
  if (accept?.startsWith("ca")) return "ca";
  if (accept?.startsWith("es")) return "es";
  return "en";
}

function msg(lang: Lang, es: string, ca: string, en: string) {
  return lang === "ca" ? ca : lang === "en" ? en : es;
}

function newSession(lang: Lang, archetype?: string): HWanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    lang,
    chain: [],
    memory: ensureState(null),
    archetype,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const input: string = (body?.input || "").toString();
    const acceptLang = req.headers.get("accept-language") || undefined;

    const detected = detectLang(input, acceptLang);

    const session: HWanckoSession = body?.session
      ? {
          ...body.session,
          lang: (body.session.lang || detected) as Lang,
          memory: ensureState(body.session.memory),
        }
      : newSession(detected, body?.archetype);

    session.turns += 1;
    session.chain = Array.isArray(session.chain) ? session.chain : [];
    session.chain.push(input);

    session.memory = ingestText(session.memory, input, "user", session.lang);

    const hits = queryMemory(session.memory, 6);
    const top = hits[0];

    const tone =
      (top?.domain === "identidad" || top?.domain === "memoria") ? "night"
      : (top?.domain === "estructura") ? "violet"
      : "day";

    const output = top?.token
      ? msg(
          session.lang,
          `Me quedo con "${top.token}" (dominio: ${top.domain}). ¿Qué parte es espejo y cuál es motor?`,
          `Em quedo amb "${top.token}" (domini: ${top.domain}). Quina part és mirall i quina és motor?`,
          `I hold "${top.token}" (domain: ${top.domain}). Which part is mirror and which is engine?`
        )
      : msg(
          session.lang,
          "Dime una frase más: quiero fijar un eje.",
          "Digue'm una frase més: vull fixar un eix.",
          "Give me one more sentence: I want to fix an axis."
        );

    const d = Math.max(0, Math.min(1, 0.45 + Math.log2(2 + session.turns) / 10));

    const au = {
      mode: "h-wancko",
      screen: "mirror",
      matrix: "AU",
      N_level: session.turns,
      signals: {
        d,
        band: 1,
        ok: d,
        tone, // day | violet | night
        complexity: Math.log2(2 + session.turns) / 6,
        beauty: 0.58,
      },
    };

    return NextResponse.json({ output, session, au });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "h-wancko error" }, { status: 500 });
  }
}

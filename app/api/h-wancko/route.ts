import { NextRequest, NextResponse } from "next/server";
import { ingestText, ensureState, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";

/* =========================================================
   Tipos de sesión H-Wancko
========================================================= */

interface HWSession {
  v: number;
  turns: number;
  lang: Lang;
  memory: AUHashState;
  chain: string[];
}

/* =========================================================
   Utilidades
========================================================= */

function detectLangStable(text: string, fallback: Lang): Lang {
  if (!text) return fallback;

  if (/[áéíóúñ¿¡]/i.test(text)) return "es";
  if (/[àèíòúç·]/i.test(text)) return "ca";
  if (/[a-z]/i.test(text)) return "en";

  return fallback;
}

function buildSession(prev: HWSession | null, lang: Lang): HWSession {
  const base =
    prev && prev.v === 2
      ? prev
      : {
          v: 2,
          turns: 0,
          lang,
          memory: ensureState(null),
          chain: [],
        };

  const fixedLang = detectLangStable("", base.lang || lang);

  return {
    ...base,
    lang: fixedLang,
    memory: ensureState(base.memory),
    chain: Array.isArray(base.chain) ? base.chain : [],
  };
}

/* =========================================================
   POST
========================================================= */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body?.text || "";
    const prevSession: HWSession | null = body?.session || null;

    const acceptLang: Lang =
      (req.headers.get("accept-language")?.slice(0, 2) as Lang) || "es";

    const session = buildSession(prevSession, acceptLang);

    /* ===== INGESTAR TEXTO ===== */

    const updatedMemory = ingestText(
  session.memory,
  text,
  "user",
  session.lang
);



    /* ===== CONSULTA DOMINIO ===== */

    const domain = queryMemory(updatedMemory);

    /* ===== RESPUESTA DINÁMICA ===== */

    let reply = "";

    if (domain) {
      reply = `↺ ${domain}`;
    } else {
      reply =
        session.lang === "ca"
          ? "Reflexiona abans de respondre."
          : session.lang === "en"
          ? "Reflect before responding."
          : "Reflexiona antes de responder.";
    }

    /* ===== NUEVA SESIÓN ===== */

    const newSession: HWSession = {
      ...session,
      turns: session.turns + 1,
      memory: updatedMemory,
      chain: [...session.chain, text],
    };

    return NextResponse.json({
      reply,
      session: newSession,
    });
  } catch (err) {
    console.error("H-Wancko error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}

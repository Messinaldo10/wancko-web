import { NextRequest, NextResponse } from "next/server";
import {
  ensureState,
  ingestText,
  queryMemory,
  type AUHashState,
  type Lang,
} from "../../../lib/auhash/minimal";

/* =========================================================
   Tipos
========================================================= */

type WanckoSession = {
  id: string;
  turns: number;
  lang?: Lang;
  chain: string[];
  silenceCount: number;
  cycle: {
    band: number;
    ok_live: number;
  };
  memory: AUHashState;
};

/* =========================================================
   Helpers
========================================================= */

function detectLang(text: string, accept?: string): Lang {
  const t = text.toLowerCase();

  if (/[àèéíïòóúüç·l]/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t)) return "es";
  if (accept?.startsWith("ca")) return "ca";
  if (accept?.startsWith("es")) return "es";
  return "en";
}

function newSession(): WanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    chain: [],
    silenceCount: 0,
    cycle: {
      band: 1,
      ok_live: 0.5,
    },
    memory: ensureState(),
  };
}

/* =========================================================
   POST
========================================================= */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: string = body?.input || "";
    const acceptLang = req.headers.get("accept-language") || undefined;

    let session: WanckoSession = body?.session || newSession();

    /* ---------------------------
       Lengua
    --------------------------- */
    const detectedLang = detectLang(input, acceptLang);

    if (!session.lang) {
      session.lang = detectedLang;
    }

    /* ---------------------------
       Turno
    --------------------------- */
    session.turns += 1;
    session.chain.push(input);

    /* ---------------------------
       Ingesta AU_HASH
    --------------------------- */
    session.memory = ingestText(
      session.memory,
      input,
      "user",
      session.lang
    );

    /* ---------------------------
       Consulta semántica (NO literal)
    --------------------------- */
    const domain = queryMemory(session.memory, input);

    /* ---------------------------
       Respuesta base
    --------------------------- */
    let output: string | null = null;

    if (domain) {
      // devuelve el concepto más estable del dominio
      const value = queryMemory(session.memory, domain);

      if (value) {
        if (session.lang === "ca")
          output = `Has parlat de ${value}.`;
        else if (session.lang === "en")
          output = `You mentioned ${value}.`;
        else
          output = `Has mencionado ${value}.`;
      }
    }

    /* ---------------------------
       Silencio estratégico
    --------------------------- */
    if (!output) {
      session.silenceCount += 1;

      if (session.lang === "ca")
        output = "Què falta perquè això sigui decidible, ara?";
      else if (session.lang === "en")
        output = "What is missing for this to be decidable, now?";
      else
        output = "¿Qué falta para que esto sea decidible, ahora?";
    }

    /* ---------------------------
       Señales AU (dinámicas)
    --------------------------- */
    const ok_live = Math.max(
      0,
      Math.min(1, 0.5 + (session.turns - session.silenceCount) * 0.02)
    );

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
      },
    };

    return NextResponse.json({
      output,
      session,
      au,
      cert: null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "wancko error" },
      { status: 500 }
    );
  }
}

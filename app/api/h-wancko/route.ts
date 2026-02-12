// app/api/h-wancko/route.ts
import { NextRequest, NextResponse } from "next/server";

import {
  ensureState,
  ingestText,
  queryMemory,
  type MemoryHit
} from "../../../lib/auhash/minimal";

import type { AUHashState, Lang } from "../../../lib/auhash/kernel";

import { computeAU, formatHit } from "../../../lib/auhash/engine";

/* =========================================================
   Tipos
========================================================= */

type HWanckoSession = {
  id: string;
  turns: number;
  lang?: Lang;
  chain: string[];
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

function newSession(): HWanckoSession {
  return {
    id: crypto.randomUUID(),
    turns: 0,
    chain: [],
    memory: ensureState(null)
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

    let session: HWanckoSession = body?.session || newSession();

    /* ---------- Language ---------- */

    const detectedLang = detectLang(input, acceptLang);

    if (!session.lang) {
      session.lang = detectedLang;
    }

    /* ---------- Turn ---------- */

    session.turns += 1;
    session.chain.push(input);

    /* ---------- Ingest ---------- */

    session.memory = ingestText(
      session.memory,
      input,
      "user",
      session.lang
    );

    /* ---------- Memory hits ---------- */

    const hits: MemoryHit[] = queryMemory(session.memory, 10);
    const top = hits[0];

    /* ---------- AU computation ---------- */

    const au = computeAU(hits, session.turns);

    /* ---------- Output ---------- */

    let output: string | null = null;

    if (top) {
      if (session.lang === "ca") {
        output = `Em quedo amb ${formatHit("ca", top)}.`;
      } else if (session.lang === "es") {
        output = `Me quedo con ${formatHit("es", top)}.`;
      } else {
        output = `I stay with ${formatHit("en", top)}.`;
      }
    } else {
      if (session.lang === "ca") {
        output = "Què falta perquè això sigui decidible, ara?";
      } else if (session.lang === "es") {
        output = "¿Qué falta para que esto sea decidible, ahora?";
      } else {
        output = "What is missing for this to be decidable now?";
      }
    }

    /* ---------- Response ---------- */

    return NextResponse.json({
      output,
      session,
      au
    });

  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "h-wancko error" },
      { status: 500 }
    );
  }
}

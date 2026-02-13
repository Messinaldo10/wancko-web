// app/api/h-wancko/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ensureState, ingestText, queryMemory } from "../../../lib/auhash/minimal";
import type { AUHashState, Lang } from "../../../lib/auhash/kernel";
import type { MemoryHit } from "../../../lib/auhash/minimal";
import { applyTor } from "../../../lib/auhash/tor";
import { computeAU, formatHit } from "../../../lib/auhash/engine";

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
    memory: ensureState(null)
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
    session.chain = Array.isArray(session.chain) ? session.chain : [];
    session.chain.push(input);
    session.archetype = body?.archetype || session.archetype || "estoic";

    /* =========================================================
       1️⃣ Ingest
    ========================================================= */

    session.memory = ingestText(
      session.memory,
      input,
      "user",
      session.lang
    );

    /* =========================================================
       2️⃣ Query hits antes de TOR
    ========================================================= */

    let hits: MemoryHit[] = queryMemory(session.memory, 10);

    /* =========================================================
       3️⃣ Aplicar TOR (homeostasis)
       Ahora SOLO devuelve nuevo estado
    ========================================================= */

    session.memory = applyTor(
      session.memory,
      "hwancko",
      hits,
      hits[0]?.token
    );

    /* =========================================================
       4️⃣ Recalcular hits después de TOR
    ========================================================= */

    hits = queryMemory(session.memory, 10);

    const top = hits[0] || null;

    /* =========================================================
       5️⃣ Salida espejo
    ========================================================= */

    let output: string | null = null;

    if (top) {
      output = msg(
        session.lang,
        `Em quedo amb ${formatHit(session.lang, top)}. Quina part és mirall i quina és motor?`,
        `I stay with ${formatHit(session.lang, top)}. Which part is mirror and which is engine?`,
        `Me quedo con ${formatHit(session.lang, top)}. ¿Qué parte es espejo y cuál es motor?`
      );
    }

    /* =========================================================
       6️⃣ Silencio estratégico
       (si no hay top claro)
    ========================================================= */

    if (!output) {
      session.silenceCount += 1;
      output = msg(
        session.lang,
        "Què falta perquè això sigui decidible, ara?",
        "What is missing for this to be decidable, now?",
        "¿Qué falta para que esto sea decidible, ahora?"
      );
    }

    /* =========================================================
       7️⃣ Calcular AU (visual / color / complejidad)
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

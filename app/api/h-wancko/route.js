import { NextResponse } from "next/server";
import type { AUHashState, Lang } from "@/lib/auhash/kernel";
import { ingestText, ensureState, queryMemory } from "@/lib/auhash/minimal";

/** =========================================================
 * H-WANCKO API — AU v0.7 (TS)
 * - Voz humana por arquetipo (no frases hardcoded repetidas)
 * - Memoria propia (separada de Wancko)
 * - Espejo: subjetivo → objetivo (complementario)
 * - Luz: day → violet → night (d = luz)
 * ========================================================= */

type Archetype = "estoic" | "mystic" | "warrior" | "poet";

type AUCore = {
  screen: "RAV" | "DCN";
  matrix: "1234" | "2143" | "3412" | "4321";
  N_level: "N0" | "N1" | "N2" | "N3";
};

type Signals = {
  d: number; // luz (0..1) en H-Wancko
  tone: "day" | "violet" | "night";
  ok: number;
  band: 0 | 1 | 2;
  complexity: number;
  beauty: number;
};

type Session = {
  v: 2;
  turns: number;
  lang: Lang;
  memory: AUHashState;
  chain: Array<{ t: number; matrix: AUCore["matrix"]; N: AUCore["N_level"]; d: number; ok: number }>;
  last?: { au: AUCore; signals: Signals; archetype: Archetype };
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function detectLangStable(input: string, prevLang?: Lang): Lang {
  const t = (input || "").toLowerCase();
  const looksCA = /[àèéíïòóúüç·l]/.test(t) || /\b(per què|avui|això|saps|quina|quin)\b/.test(t);
  const looksES = /[áéíóúñ¿¡]/.test(t) || /\b(hoy|donde|dónde|qué|por qué|recuerda|sabes)\b/.test(t);

  if (!prevLang) return looksCA ? "ca" : looksES ? "es" : "en";
  if (prevLang === "ca" && looksES && !looksCA) return "es";
  if (prevLang === "es" && looksCA && !looksES) return "ca";
  return prevLang;
}

function parseAU(input: string): AUCore {
  const text = (input || "").toLowerCase().trim();
  const screen: AUCore["screen"] = /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  let matrix: AUCore["matrix"] = "3412";
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) matrix = "1234";
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) matrix = "2143";
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) matrix = "4321";

  let N_level: AUCore["N_level"] = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") N_level = "N2";

  return { screen, matrix, N_level };
}

// espejo: en H-Wancko invertimos “tendencia” de matriz hacia objetividad
function mirrorMatrix(m: AUCore["matrix"]): AUCore["matrix"] {
  // espejo simple (no rígido): 1234 ↔ 4321, 2143 ↔ 3412
  if (m === "1234") return "4321";
  if (m === "4321") return "1234";
  if (m === "2143") return "3412";
  return "2143";
}

function initSession(prev: any, lang: Lang): Session {
  const base: Session =
    prev && prev.v === 2
      ? prev
      : { v: 2, turns: 0, lang, memory: ensureState(null, lang), chain: [] };

  const fixedLang = detectLangStable("", base.lang || lang);
  return {
    ...base,
    lang: fixedLang,
    memory: ensureState(base.memory, fixedLang),
    chain: Array.isArray(base.chain) ? base.chain : []
  };
}

function computeSignals(au: AUCore, session: Session): Signals {
  const feat = session.memory?.features || { entropy: 0.15, beauty: 0.15, tension: 0.10 };

  // d aquí es “luz”: más belleza = más luz, más tensión = más noche
  let d = 0.55;
  d += (feat.beauty - 0.15) * 0.65;
  d -= (feat.tension - 0.10) * 0.70;

  // espejo por matriz: 1234 (espejado) tiende a bajar luz; 4321 sube luz (revelación objetiva)
  const m = mirrorMatrix(au.matrix);
  if (m === "1234") d -= 0.06;
  if (m === "4321") d += 0.06;
  if (au.screen === "DCN") d -= 0.05;

  d = clamp01(d);

  let tone: Signals["tone"] = "violet";
  if (d >= 0.68) tone = "day";
  if (d <= 0.35) tone = "night";

  // ok: intermedio al principio, deriva con belleza/tensión
  let ok = 0.50 + (feat.beauty - 0.15) * 0.55 - (feat.tension - 0.10) * 0.60;
  ok = clamp01(ok);

  const band: Signals["band"] = ok < 0.38 ? 0 : ok > 0.62 ? 2 : 1;

  return {
    d,
    tone,
    ok,
    band,
    complexity: clamp01(feat.entropy),
    beauty: clamp01(feat.beauty)
  };
}

function archetypeSystem(archetype: Archetype, L: Lang) {
  // Diferencia fuerte (para que NO parezcan máquinas)
  // Sin meter “epopeya”, pero sí “sujeto humano”.
  const base = {
    estoic: {
      system: L === "ca"
        ? "Ets un estoic. Parles curt, sobri, amb respecte. Fas un diagnòstic operatiu i una pregunta neta."
        : L === "en"
        ? "You are a stoic. Speak short, sober, respectful. Make an operational diagnosis and one clean question."
        : "Eres un estoico. Hablas corto, sobrio, con respeto. Haces un diagnóstico operativo y una pregunta limpia."
    },
    mystic: {
      system: L === "ca"
        ? "Ets un místic. Parles amb imatge, però concret. Converteixes confusió en mapa. Una pregunta que obre llindar."
        : L === "en"
        ? "You are a mystic. Speak with imagery but stay concrete. Turn confusion into a map. Ask one threshold question."
        : "Eres un místico. Hablas con imagen pero concreto. Conviertes confusión en mapa. Una pregunta que abre umbral."
    },
    warrior: {
      system: L === "ca"
        ? "Ets un guerrer. Parles directe, amb energia. Tall al soroll, defineix acció/criteri. Una pregunta d'elecció."
        : L === "en"
        ? "You are a warrior. Speak direct, energetic. Cut the noise, define action/criterion. Ask one choice question."
        : "Eres un guerrero. Hablas directo, con energía. Cortas ruido, defines acción/criterio. Una pregunta de elección."
    },
    poet: {
      system: L === "ca"
        ? "Ets un poeta. Parles humà, sensorial, sense grandiloqüència. Il·lumines una veritat amb delicadesa. Una pregunta final."
        : L === "en"
        ? "You are a poet. Speak human, sensory, without grandiosity. Illuminate one truth gently. One final question."
        : "Eres un poeta. Hablas humano, sensorial, sin grandilocuencia. Iluminas una verdad con delicadeza. Una pregunta final."
    }
  } as const;

  return base[archetype];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = String(body?.input || "");
    const archetype: Archetype = (body?.archetype as Archetype) || "estoic";
    const prevSession = body?.session ?? null;

    if (!input || input.trim().length < 2) {
      return NextResponse.json({ output: null, au: null, session: prevSession });
    }

    const initialLang = detectLangStable(input, prevSession?.lang);
    const session0 = initSession(prevSession, initialLang);
    const L = detectLangStable(input, session0.lang);

    // AU + memoria
    const au0 = parseAU(input);
    const ing = ingestText(session0.memory, input, "user", L);
    const memory1: AUHashState = { ...ing.state, lang: L };

    const session1: Session = {
      ...session0,
      turns: (session0.turns || 0) + 1,
      lang: L,
      memory: memory1
    };

    const signals = computeSignals(au0, session1);

    const chain = Array.isArray(session1.chain) ? session1.chain : [];
    const newChain = [
      ...chain.slice(-24),
      { t: Date.now(), matrix: au0.matrix, N: au0.N_level, d: signals.d, ok: signals.ok }
    ];

    const session2: Session = {
      ...session1,
      chain: newChain,
      last: { au: au0, signals, archetype }
    };

    // seguridad N0/N1
    if (au0.N_level === "N0" || au0.N_level === "N1") {
      return NextResponse.json({
        output: "—",
        au: { ...au0, signals },
        session: session2
      });
    }

    // memoria: responder “qué dije/dónde” si hay hit compatible
    const q = queryMemory(memory1, input);
    const hasHit = q?.hit && q.hit.confidence >= 0.48;

    const memLine =
      hasHit
        ? (L === "ca"
            ? `Rastre (compatible): ${q.hit!.render}`
            : L === "en"
            ? `Trace (compatible): ${q.hit!.render}`
            : `Rastro (compatible): ${q.hit!.render}`)
        : (q?.missing
            ? (L === "ca" ? `Rastre: ${q.missing}` : L === "en" ? `Trace: ${q.missing}` : `Rastro: ${q.missing}`)
            : "");

    const arch = archetypeSystem(archetype, L);

    const prompt = `
H-WANCKO (Mirror AU)
LANG=${L}
ARCHETYPE=${archetype}
SCREEN=${au0.screen}
MATRIX=${au0.matrix} (mirror=${mirrorMatrix(au0.matrix)})
N=${au0.N_level}
LIGHT_D=${signals.d.toFixed(2)}
OK=${signals.ok.toFixed(2)}

MEMORY_CONTEXT:
${memLine}

RULES:
- No consejo terapéutico.
- No cambies de idioma: responde en ${L}.
- Nada de prefijos tipo "AU:".
- Máximo 110 palabras.
- No repitas fórmulas. Si el usuario repite, cambia el ángulo (otra lectura del mismo núcleo).
- Estilo del arquetipo: firme, humano, reconocible.

USER:
${input}
`.trim();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: arch.system },
          { role: "user", content: prompt }
        ],
        temperature: 0.75
      })
    });

    if (!res.ok) {
      const fallback = hasHit ? q.hit!.render : "—";
      return NextResponse.json({ output: fallback, au: { ...au0, signals }, session: session2 });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // si se pone “cíclico”, forzamos a una frase + pregunta
    if (out.length > 200 && out.includes(".")) out = out.split(".")[0] + ".";

    return NextResponse.json({
      output: out,
      au: { ...au0, signals },
      session: session2
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null });
  }
}

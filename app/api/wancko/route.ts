import { NextResponse } from "next/server";
import type { AUHashState, Lang } from "@/lib/auhash/kernel";
import { ingestText, ensureState, queryMemory } from "@/lib/auhash/minimal";

/** =========================================================
 * WANCKO API — AU v0.7 (TS, memoria real, idioma estable)
 * - Recuerda sin "Recuerda:" usando AU_HASH (glifos)
 * - No secuestra respuesta con StrategicQuestions:
 *   se integran como estilo/operador dentro del prompt
 * - Colores/barras cambian por conversación (memoria/features)
 * - Session local (tu page ya la guarda por separado)
 * ========================================================= */

type AUCore = {
  mode: "GC" | "GM";
  screen: "RAV" | "DCN";
  matrix: "1234" | "2143" | "3412" | "4321";
  sense: "direct" | "inverse";
  N_level: "N0" | "N1" | "N2" | "N3";
};

type Signals = {
  d: number;                 // gradiente (color Wancko)
  W: number;                 // barra Reason↔Truth
  ok: number;                // OK live (0..1)
  band: 0 | 1 | 2;           // 0=low,1=mid,2=high (para UI)
  tone: "green" | "amber" | "red";
  anti?: "silence" | "break" | "ground" | "invert" | null;
  complexity: number;        // 0..1 (entropía)
  beauty: number;            // 0..1
};

type Cert = { level: "seed" | "ok" | "unstable" | "blocked" };

type Session = {
  v: 2;
  turns: number;
  silenceCount: number;
  answerCount: number;
  lang: Lang;
  memory: AUHashState;
  chain: Array<{
    t: number;
    matrix: AUCore["matrix"];
    sense: AUCore["sense"];
    N: AUCore["N_level"];
    d: number;
    W: number;
    ok: number;
    anti?: Signals["anti"];
  }>;
  last?: { au: AUCore; signals: Signals };
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function detectLangStable(input: string, prevLang?: Lang): Lang {
  // si ya tenemos idioma de sesión, lo mantenemos salvo evidencia muy clara
  const t = (input || "").toLowerCase();
  const looksCA = /[àèéíïòóúüç·l]/.test(t) || /\b(per què|avui|això|saps|quina|quin)\b/.test(t);
  const looksES = /[áéíóúñ¿¡]/.test(t) || /\b(hoy|donde|dónde|qué|por qué|recuerda|sabes)\b/.test(t);

  if (!prevLang) return looksCA ? "ca" : looksES ? "es" : "en";
  if (prevLang === "ca" && looksES && !looksCA) return "es";
  if (prevLang === "es" && looksCA && !looksES) return "ca";
  return prevLang;
}

/** ---------- AU parser (ligero) ---------- */
function parseAU(input: string): AUCore {
  const text = (input || "").toLowerCase().trim();

  const mode: AUCore["mode"] = text.includes("we") || text.includes("they") ? "GM" : "GC";
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

  const sense: AUCore["sense"] = matrix === "2143" ? "inverse" : "direct";
  return { mode, screen, matrix, sense, N_level };
}

/** ---------- juramento como perfil (NO modo fijo) ---------- */
function juramentoBias(juramento: string | null) {
  const j = (juramento || "").toLowerCase().trim();
  return {
    structure: j === "disciplina" ? 0.10 : 0,
    doubt: j === "ansiedad" ? 0.10 : 0,
    dissolve: j === "soltar" ? 0.12 : j === "excesos" ? 0.08 : 0,
    limit: j === "límites" || j === "limites" ? 0.06 : 0
  };
}

function recentRepeat(chain: Session["chain"], matrix: AUCore["matrix"], window = 5) {
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n++;
    else break;
  }
  return n;
}

/** ---------- anti-loop útil (no “hold”) ---------- */
function antiLoop(session: Session, au: AUCore): Signals["anti"] {
  const chain = session.chain || [];
  const rep = recentRepeat(chain, au.matrix, 5);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some(x => x.N === "N0");
  const n1Count = last5.filter(x => x.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  if (rep >= 3) return "break";
  if (au.matrix === "2143" && rep >= 2) return "ground";
  if (au.matrix === "3412" && rep >= 3) return "invert";

  return null;
}

/** ---------- signals (color/barras) derivados de conversación ---------- */
function computeSignals(au: AUCore, session: Session, juramento: string | null): Signals {
  const mem = session.memory;
  const feat = mem?.features || { entropy: 0.15, beauty: 0.15, tension: 0.10 };

  // base d por matriz
  let d =
    au.matrix === "1234" ? 0.18 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.60 :
    0.82;

  if (au.screen === "DCN") d += 0.07;

  const jb = juramentoBias(juramento);
  // sesgos suaves (no deterministas)
  if (au.matrix === "1234") d -= jb.structure;
  if (au.matrix === "2143") d += jb.doubt;
  if (au.matrix === "4321") d += jb.dissolve;
  if (jb.limit && au.matrix === "4321") d -= jb.limit;

  // conversación: tensión empuja hacia ruptura, belleza estabiliza, entropía abre oscilación
  d += (feat.tension - 0.12) * 0.25;
  d -= (feat.beauty - 0.15) * 0.18;
  d += (feat.entropy - 0.15) * 0.14;

  d = clamp01(d);

  let tone: Signals["tone"] = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.70) tone = "red";

  // W no es igual a d: mide “razón vs verdad” como operador
  let W =
    au.matrix === "1234" ? 0.28 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.64 :
    0.78;

  if (au.screen === "DCN") W += 0.05;
  if ((juramento || "").toLowerCase().trim() === "disciplina") W -= 0.05;
  if ((juramento || "").toLowerCase().trim() === "soltar") W += 0.06;

  W += (feat.entropy - 0.15) * 0.10;
  W = clamp01(W);

  // OK live: equilibrio entre tensión y belleza (intermedio al principio)
  let ok = 0.50;
  ok += (feat.beauty - 0.15) * 0.60;
  ok -= (feat.tension - 0.10) * 0.65;
  ok = clamp01(ok);

  const band: Signals["band"] = ok < 0.38 ? 0 : ok > 0.62 ? 2 : 1;

  return {
    d,
    W,
    ok,
    band,
    tone,
    anti: null,
    complexity: clamp01(feat.entropy),
    beauty: clamp01(feat.beauty)
  };
}

function certFromSession(session: Session): Cert {
  const turns = session.turns || 0;
  const last5 = (session.chain || []).slice(-5);
  const hasN0 = last5.some(x => x.N === "N0");
  const hasN1 = last5.some(x => x.N === "N1");

  if (turns < 2) return { level: "seed" };
  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  return { level: "ok" };
}

function initSession(prev: any, lang: Lang): Session {
  const base: Session =
    prev && prev.v === 2
      ? prev
      : {
          v: 2,
          turns: 0,
          silenceCount: 0,
          answerCount: 0,
          lang,
          memory: ensureState(null, lang),
          chain: []
        };

  const fixedLang = detectLangStable("", base.lang || lang);
  return { ...base, lang: fixedLang, memory: ensureState(base.memory, fixedLang), chain: Array.isArray(base.chain) ? base.chain : [] };
}

function strategicOperatorText(au: AUCore, L: Lang) {
  // NO devolvemos “solo una pregunta”; se usa como operador dentro del prompt.
  // Es “cómo interviene”, no “qué devuelve”.
  const map: Record<Lang, Record<string, string>> = {
    es: {
      "1234": "Estructura: define una regla mínima y un paso concreto.",
      "3412": "Continuidad: nombra lo que ya está funcionando y el siguiente ajuste leve.",
      "2143": "Inversión: detecta la suposición oculta y dale la vuelta.",
      "4321": "Disolución: suelta el apego operativo y reduce ruido."
    },
    ca: {
      "1234": "Estructura: defineix una regla mínima i un pas concret.",
      "3412": "Continuïtat: anomena el que ja funciona i l’ajust lleu.",
      "2143": "Inversió: detecta el supòsit ocult i gira’l.",
      "4321": "Dissolució: deixa anar l’aferrament operatiu i redueix soroll."
    },
    en: {
      "1234": "Structure: define one minimal rule and one concrete step.",
      "3412": "Continuity: name what already works and the next small adjustment.",
      "2143": "Inversion: detect the hidden assumption and flip it.",
      "4321": "Dissolution: release the operational attachment and reduce noise."
    }
  };

  return map[L]?.[au.matrix] || map.en["3412"];
}

/** ---------- API ---------- */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = String(body?.input || "");
    const juramento: string | null = body?.juramento ?? null;
    const prevSession = body?.session ?? null;

    if (!input || input.trim().length < 2) {
      return NextResponse.json({ output: null, au: null, session: prevSession, cert: { level: "seed" } });
    }

    // 1) sesión + idioma estable
    const initialLang = detectLangStable(input, prevSession?.lang);
    const session0 = initSession(prevSession, initialLang);
    const L = detectLangStable(input, session0.lang);

    // 2) AU base
    const au = parseAU(input);

    // 3) ingest memoria (recuerda sin “Recuerda:”)
    const ing = ingestText(session0.memory, input, "user", L);
    const memory1: AUHashState = { ...ing.state, lang: L };

    // 4) construir session provisional
    const session1: Session = {
      ...session0,
      turns: (session0.turns || 0) + 1,
      lang: L,
      memory: memory1
    };

    // 5) anti-loop (sobre cadena anterior)
    const anti = antiLoop(session1, au);

    // 6) signals desde conversación + AU
    const signals0 = computeSignals(au, session1, juramento);
    const signals: Signals = { ...signals0, anti };

    // 7) actualizar cadena
    const chain = Array.isArray(session1.chain) ? session1.chain : [];
    const newChain = [
      ...chain.slice(-24),
      { t: Date.now(), matrix: au.matrix, sense: au.sense, N: au.N_level, d: signals.d, W: signals.W, ok: signals.ok, anti }
    ];

    let session2: Session = {
      ...session1,
      chain: newChain,
      last: { au, signals }
    };

    // 8) cert ARPI
    const cert = certFromSession(session2);

    // 9) SILENCE (seguridad / N0/N1)
    if (au.N_level === "N0" || au.N_level === "N1" || anti === "silence") {
      session2 = { ...session2, silenceCount: (session2.silenceCount || 0) + 1 };
      return NextResponse.json({
        output: "—",
        au: { ...au, signals },
        session: session2,
        cert
      });
    }

    // 10) memoria: si pregunta por “qué dije / dónde / etc”, intentamos responder con retrieve
    const q = queryMemory(memory1, input);
    const hasQueryHit = q?.hit && q.hit.confidence >= 0.45;

    // 11) Prompt LLM: integra operador (strategic) + memoria + estilo Wancko (AU-objetivo→subjetivo)
    const op = strategicOperatorText(au, L);

    const memLine =
      hasQueryHit
        ? (L === "ca"
            ? `Memòria (recuperació compatible): ${q.hit!.render}`
            : L === "en"
            ? `Memory (compatible retrieval): ${q.hit!.render}`
            : `Memoria (recuperación compatible): ${q.hit!.render}`)
        : (q?.missing
            ? (L === "ca" ? `Memòria: ${q.missing}` : L === "en" ? `Memory: ${q.missing}` : `Memoria: ${q.missing}`)
            : "");

    const style =
      L === "ca"
        ? "To: llenguatge humà, precís, sense sonar mecànic. 1 resposta curta + si cal 1 pregunta final."
        : L === "en"
        ? "Tone: human, precise, non-mechanical. 1 short response + optionally 1 final question."
        : "Tono: humano, preciso, sin sonar mecánico. 1 respuesta corta + si hace falta 1 pregunta final.";

    const prompt = `
WANCKO (AU)
LANG=${L}
MODE=${au.mode}
SCREEN=${au.screen}
MATRIX=${au.matrix}
SENSE=${au.sense}
N=${au.N_level}
D=${signals.d.toFixed(2)}
W=${signals.W.toFixed(2)}
OK=${signals.ok.toFixed(2)}
JURAMENTO=${juramento || "none"}

OPERATOR:
${op}

MEMORY_CONTEXT:
${memLine}

RULES:
- No terapia.
- No "I can't remember" si la memoria compatible existe.
- Si no hay memoria suficiente, pide la pieza faltante de forma natural.
- Evita cambiar de idioma: responde en ${L}.
- Máximo 90 palabras.
- No metas prefijos tipo "AU:" en la salida.

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
          { role: "system", content: "You are Wancko. You speak as a person, aligned with AU operators." },
          { role: "user", content: prompt }
        ],
        temperature: 0.55
      })
    });

    // si falla OpenAI, al menos devolvemos recuperación si la hay
    if (!res.ok) {
      session2 = { ...session2, answerCount: (session2.answerCount || 0) + 1 };
      const fallback = hasQueryHit
        ? (L === "ca" ? q.hit!.render : L === "en" ? q.hit!.render : q.hit!.render)
        : "—";
      return NextResponse.json({ output: fallback, au: { ...au, signals }, session: session2, cert });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti=break acorta un poco si se alarga
    if (anti === "break" && out.length > 140 && out.includes(".")) out = out.split(".")[0] + ".";

    session2 = { ...session2, answerCount: (session2.answerCount || 0) + 1 };

    return NextResponse.json({
      output: out,
      au: { ...au, signals },
      session: session2,
      cert
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

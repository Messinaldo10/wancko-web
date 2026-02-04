import { NextResponse } from "next/server";

/** =========================================================
 *  H-WANCKO API — Mirror AU v0.3
 *  - Respuesta humana por arquetipo (LLM)
 *  - Memoria separada (no mezclada con Wancko)
 *  - AU complementario: luz (d) + tono day/violet/night
 *  - Evita repetición: si se parece demasiado, fuerza variación
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function norm(str) {
  return String(str || "").trim();
}
function normLower(str) {
  return norm(str).toLowerCase();
}
function safeObj(x) {
  return x && typeof x === "object" ? x : {};
}
function array(x) {
  return Array.isArray(x) ? x : [];
}

/** ---- language lock (separate) ---- */
function detectLang(text) {
  const t = normLower(text);
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(per què|què|això|avui|m'ho)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|por qué|hoy|voy|montaña|playa)\b/.test(t)) return "es";
  return "en";
}
function getLangLock(prevSession, req, input) {
  const s = safeObj(prevSession);
  const explicit = normLower(input);

  if (/(responde en catal[aà]n|en catal[aà]n)/.test(explicit)) return "ca";
  if (/(responde en espa[nñ]ol|en espa[nñ]ol|en castellano)/.test(explicit)) return "es";
  if (/(answer in english|in english|respond in english)/.test(explicit)) return "en";

  if (s.lang_lock) return s.lang_lock;

  const header = req.headers.get("accept-language")?.slice(0, 2);
  const h = header === "es" || header === "ca" || header === "en" ? header : null;
  return h || detectLang(input);
}

/** ---- lightweight AU parse (mirror) ---- */
function parseAU(input) {
  const text = normLower(input);

  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  } else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { screen, matrix, sense, N_level };
}

/** mirror mapping: inverse family to Wancko */
function invertMatrixForArchetype(matrix) {
  const m = String(matrix);
  // complementary swap
  if (m === "1234") return "4321";
  if (m === "4321") return "1234";
  if (m === "2143") return "3412";
  if (m === "3412") return "2143";
  return "3412";
}

/** signals: d = luz (alto => día) */
function hSignals(au, prevSession, archetype) {
  // base by (mirrored) matrix
  const m = au.matrix;
  let d =
    m === "1234" ? 0.78 :
    m === "2143" ? 0.60 :
    m === "3412" ? 0.52 :
    m === "4321" ? 0.35 :
    0.55;

  if (au.screen === "DCN") d -= 0.08;

  const a = normLower(archetype);
  // archetype bias (subtle but visible)
  if (a === "mystic") d -= 0.04;
  if (a === "warrior") d += 0.03;
  if (a === "poet") d -= 0.02;

  d = clamp01(d);

  let tone = "violet";
  if (d >= 0.72) tone = "day";
  if (d <= 0.38) tone = "night";

  // ok proxy (mirror)
  let ok = 0.5;
  if (au.N_level === "N3") ok += 0.10;
  if (au.N_level === "N1") ok -= 0.14;
  if (au.N_level === "N0") ok -= 0.25;
  ok += (d - 0.55) * 0.10;
  ok = clamp01(ok);

  // bar (objective complement): 0..1
  const bar = clamp01(0.35 + (d - 0.5) * 0.9);

  return { d, tone, ok, bar };
}

/** session */
function nextSession(prev, au, signals, archetype, lang) {
  const base = safeObj(prev);
  const chain = array(base.chain);

  const next = {
    v: 2,
    lang_lock: lang,
    turns: (base.turns || 0) + 1,
    archetype: archetype || base.archetype || "estoic",
    last: { ...au, signals },
    chain: [
      ...chain.slice(-29),
      {
        t: Date.now(),
        matrix: au.matrix,
        N: au.N_level,
        d: signals.d,
        tone: signals.tone,
        ok: signals.ok
      }
    ],
    cycle: {
      band: Math.max(1, Math.min(4, 1 + (au.matrix === "1234" ? 0 : au.matrix === "2143" ? 1 : au.matrix === "3412" ? 2 : 3))),
      ok_live: signals.ok
    },
    // repetition guard
    last_out: base.last_out || ""
  };

  return next;
}

/** repetition detector */
function tooSimilar(a, b) {
  const A = normLower(a);
  const B = normLower(b);
  if (!A || !B) return false;
  // crude similarity: shared long prefix or many shared words
  const aWords = new Set(A.split(/\s+/).filter((x) => x.length > 4));
  const bWords = new Set(B.split(/\s+/).filter((x) => x.length > 4));
  let overlap = 0;
  for (const w of aWords) if (bWords.has(w)) overlap += 1;
  return overlap >= 6 || (A.slice(0, 40) && A.slice(0, 40) === B.slice(0, 40));
}

const ARCH = {
  estoic: {
    label: "Estoic",
    voice: "a restrained, lucid human voice; firm but respectful; zero ornament",
    lexical: "short sentences; concrete nouns; no poetry"
  },
  mystic: {
    label: "Mystic",
    voice: "a human voice with symbolic perception; calm, precise; not grandiose",
    lexical: "one symbolic image maximum; avoid clichés"
  },
  warrior: {
    label: "Warrior",
    voice: "a human voice with resolve; direct; energetic; not aggressive",
    lexical: "verbs; decisions; minimal adjectives"
  },
  poet: {
    label: "Poet",
    voice: "a human voice with lyrical clarity; tender; disciplined; not vague",
    lexical: "metaphor allowed but anchored; no riddle spam"
  }
};

export async function POST(req) {
  try {
    const body = await req.json();
    const input = norm(body?.input);
    const archetype = ARCH[body?.archetype] ? body.archetype : "estoic";
    const sessionIn = body?.session || null;

    const session0 = safeObj(sessionIn);
    const lang = getLangLock(session0, req, input);

    if (!input || input.length < 2) {
      const seedSession = {
        ...session0,
        lang_lock: lang,
        cycle: session0.cycle || { band: 1, ok_live: 0.55 }
      };
      return NextResponse.json({ output: null, au: null, session: seedSession });
    }

    let au = parseAU(input);
    // mirror mapping
    au.matrix = invertMatrixForArchetype(au.matrix);

    const signals = hSignals(au, session0, archetype);
    let session = nextSession(session0, au, signals, archetype, lang);

    const memorySummary = (() => {
      const last = array(session.chain).slice(-3).map((x) => `${x.matrix}/${x.tone}`).join(" · ");
      return last || "—";
    })();

    const a = ARCH[archetype];

    const prompt = `
LANG_LOCK: ${lang}
ARCHETYPE: ${a.label}
VOICE: ${a.voice}
STYLE: ${a.lexical}

SCREEN: ${au.screen}
MATRIX: ${au.matrix}
LIGHT_D: ${signals.d.toFixed(2)}
TONE: ${signals.tone}
OK_LIVE: ${signals.ok.toFixed(2)}

RECENT TRACE:
${memorySummary}

RULES:
- You are a person speaking (historical operator), not a machine.
- No therapy. No advice. No diagnosis. No “tell me more”.
- Do not repeat the same cadence. Avoid templated lines.
- 1 concise paragraph (max 75 words).
- Write in ${lang}.
- If user asks “who are you?”, answer in-character, grounded.

USER:
${input}

TASK:
Respond as the archetype, preserving continuity.
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
          { role: "system", content: "You are H-Wancko: archetypal human voice. Keep continuity within this chat." },
          { role: "user", content: prompt }
        ],
        temperature: 0.75
      })
    });

    let out = "—";
    if (res.ok) {
      const data = await res.json();
      out = data?.choices?.[0]?.message?.content?.trim() || "—";
    }

    // anti-repetition: if too similar to last_out, ask model again with variation
    if (out !== "—" && tooSimilar(out, session.last_out)) {
      const reprompt = prompt + `\n\nCONSTRAINT:\n- Avoid repeating previous phrasing. Use different cadence.`;
      const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Rewrite with fresh phrasing; keep same meaning and voice." },
            { role: "user", content: reprompt }
          ],
          temperature: 0.9
        })
      });
      if (res2.ok) {
        const d2 = await res2.json();
        const o2 = d2?.choices?.[0]?.message?.content?.trim();
        if (o2) out = o2;
      }
    }

    session.last_out = out;

    return NextResponse.json({
      output: out,
      au: { ...au, signals },
      session
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null
    });
  }
}

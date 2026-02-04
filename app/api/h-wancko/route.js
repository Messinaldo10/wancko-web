import { NextResponse } from "next/server";

/** =========================================================
 * H-WANCKO — AU Mirror v0.5
 * - Voz humana por arquetipo (no frases fijas)
 * - AU espejo: el recorrido subjetivo→objetivo (complementario a Wancko)
 * - "Luz" d (day/violet/night) + barra propia (ok/band)
 * - Memoria propia (separada) + idioma estable
 * - Sin terapia. Sin consejo. Sin seguimiento.
 * ========================================================= */

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const now = () => Date.now();

function norm(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}
function lc(s) {
  return String(s || "").toLowerCase();
}

/* ---------- language stable ---------- */
function detectLangStrong(text) {
  const t = lc(text);
  const caStrong =
    /[àèéíïòóúüç·l]/.test(t) ||
    /\b(què|per què|això|aquesta|aquest|m'|em|\bon\b|\bdel\b|\bels\b|\bles\b)\b/.test(t);
  const esStrong =
    /[áéíóúñ¿¡]/.test(t) ||
    /\b(qué|por qué|ciudad|animal|playa|montaña|hoy|mañana)\b/.test(t);
  if (caStrong && !esStrong) return "ca";
  if (esStrong && !caStrong) return "es";
  return null;
}

function initMemory(base) {
  const mem = base?.memory && typeof base.memory === "object" ? base.memory : {};
  return {
    facts: mem.facts && typeof mem.facts === "object" ? mem.facts : {},
    topics: mem.topics && typeof mem.topics === "object" ? mem.topics : {},
    langVotes: mem.langVotes && typeof mem.langVotes === "object" ? mem.langVotes : { es: 0, ca: 0, en: 0 }
  };
}
function bumpTopic(memory, key, w = 1, t = now()) {
  const cur = memory.topics[key] || { t, w: 0 };
  memory.topics[key] = { t, w: Math.min(9, (cur.w || 0) + w) };
}
function setFact(memory, key, v, w = 2, t = now()) {
  memory.facts[key] = { v, t, w: Math.min(9, w) };
}

function updateLang(memory, session, input, accept) {
  const d = detectLangStrong(input);
  if (d) memory.langVotes[d] = (memory.langVotes[d] || 0) + 1;

  const entries = Object.entries(memory.langVotes).sort((a, b) => b[1] - a[1]);
  const best = entries[0];
  const second = entries[1] || ["", 0];
  const current = session?.lang || accept || "es";
  if (best && best[0] && best[1] >= second[1] + 2) return best[0];
  return current;
}

/* ---------- AU parse (shared-ish) ---------- */
function parseAUBase(input) {
  const text = lc(input).trim();

  const mode = /\b(we|they|nosotros|ellos|nosaltres|ells)\b/.test(text) ? "GM" : "GC";
  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad|fatig|esgotad)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) matrix = "1234";
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) matrix = "4321";
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|qu[eè] passa si)/.test(text)
  ) matrix = "2143";

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pànic|obsession)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|fer mal|violència)/.test(text)) N_level = "N0";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ---------- mirror mapping (subjective→objective) ----------
   H-Wancko interpreta las matrices como espejo:
   - Wancko: 1234 = estructura (verde) ... 4321 = disolución (rojo)
   - H:      4321 es "revelación" (más luz) si está bien integrada
   Para el "luz d" usamos:
   1234 -> violeta medio (forma)
   3412 -> violeta estable
   2143 -> noche si se estanca (duda sin mito)
   4321 -> día si se integra (desprendimiento con claridad)
*/
function computeSignalsMirror(au, prevSession, memory) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = chain.slice(-6).filter((x) => x?.matrix === au.matrix).length;

  // base light d
  let d =
    au.matrix === "4321" ? 0.72 :
    au.matrix === "3412" ? 0.55 :
    au.matrix === "1234" ? 0.52 :
    au.matrix === "2143" ? 0.42 :
    0.55;

  if (au.screen === "DCN") d -= 0.06; // en H, DCN oscurece (fatiga)
  if (rep >= 2 && au.matrix === "2143") d -= 0.08; // duda repetida -> noche
  if (rep >= 2 && au.matrix === "4321") d += 0.05; // soltar repetido -> más luz

  // topic richness: more "myth load" -> violet (not night)
  const topicMass = Object.values(memory?.topics || {}).reduce((a, x) => a + (x?.w || 0), 0);
  if (topicMass > 8) d += 0.03;

  d = clamp01(d);

  let tone = "violet";
  if (d >= 0.70) tone = "day";
  if (d <= 0.35) tone = "night";

  // ok mirror: wants mid early, then follows coherence
  const turns = (prevSession?.turns || 0) + 1;
  const coherence = 1 - Math.abs(d - 0.55);
  const ok = clamp01(0.18 + 0.62 * coherence - Math.min(0.18, rep * 0.05));
  let band = 1;
  if (ok > 0.75) band = 0;
  else if (ok > 0.62) band = 1;
  else if (ok > 0.48) band = 2;
  else band = 3;

  // complexity/beauty
  const complexity = clamp01(Math.log2(2 + turns) / 6);
  const beauty = clamp01(Math.log(1 + (ok * 4 + (1 - rep * 0.12))) / Math.log(6));

  return { d, tone, ok, band, complexity, beauty, sense: au.sense };
}

/* ---------- arquetipos (voz real) ---------- */
const ARCHETYPES = {
  estoic: {
    label: "Estoic",
    style: "plain, firm, minimal, honest. No ornament."
  },
  mystic: {
    label: "Mystic",
    style: "symbolic, threshold language, violet imagery, gentle but precise."
  },
  warrior: {
    label: "Warrior",
    style: "direct, decisive, embodied, action clarity. No bravado."
  },
  poet: {
    label: "Poet",
    style: "human, vivid, attentive to what is unsaid; concise."
  }
};

/* ---------- session update ---------- */
function nextSession(prev, au, signals, memory, lang, archetype) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];
  return {
    v: 2,
    turns: (base.turns || 0) + 1,
    lang: lang || base.lang || "es",
    archetype,
    memory,
    last: { ...au, signals },
    chain: [
      ...chain.slice(-49),
      {
        t: now(),
        matrix: au.matrix,
        N: au.N_level,
        d: signals.d,
        ok: signals.ok,
        band: signals.band,
        intent: au.intervention
      }
    ]
  };
}

/* ---------- MAIN API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const inputRaw = body?.input;
    const session = body?.session || null;
    const archetypeRaw = body?.archetype || "estoic";

    const input = norm(inputRaw);
    if (!input || input.length < 2) return NextResponse.json({ output: null, au: null, session });

    const accept = req.headers.get("accept-language")?.slice(0, 2) || "es";
    const base = session && typeof session === "object" ? session : {};
    const memory = initMemory(base);

    // update language stable
    const lang = updateLang(memory, base, input, accept);

    // AU parse
    let au = parseAUBase(input);

    // minimal facts/topics (shared)
    const t = lc(input);
    if (/\b(playa|platja|beach)\b/.test(t)) bumpTopic(memory, "GL_LUGAR_DESCANSO", 1.0);
    if (/\b(monta[nñ]a|muntanya|mountain)\b/.test(t)) bumpTopic(memory, "GL_LUGAR_ELEVACION", 1.0);

    const animalMatch = input.match(/(?:recuerda:\s*)?(?:el\s*)?animal\s*(?:es|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
    if (animalMatch) setFact(memory, "animal", norm(animalMatch[1]).replace(/[.?!]+$/g, ""), 2.0);

    const cityMatch =
      input.match(/(?:recuerda:\s*)?(?:la\s*)?ciudad\s*(?:es|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i) ||
      input.match(/(?:la\s*)?ciutat\s*(?:[eé]s|=|:)\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
    if (cityMatch) setFact(memory, "city", norm(cityMatch[1]).replace(/[.?!]+$/g, ""), 2.0);

    // signals mirror
    const signals = computeSignalsMirror(au, base, memory);

    // session
    const key = ARCHETYPES[archetypeRaw] ? archetypeRaw : "estoic";
    const next = nextSession(base, au, signals, memory, lang, key);

    // SILENCE if N0/N1
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "—",
        au: { ...au, signals },
        session: next,
        meta: { archetype: key, historical: true }
      });
    }

    // Use OpenAI for true human voice by archetype + mirror AU
    const arch = ARCHETYPES[key];

    const system = `
You are H-Wancko, a historical operator voice.
You must sound like a person, not a machine.
No therapy. No advice. No reassurance. No follow-up invitation.
One short intervention: 18–90 words. Language: ${lang}.
Keep archetype identity stable.

Archetype: ${arch.label}.
Style: ${arch.style}.

Mirror-AU context:
MATRIX=${au.matrix}, SCREEN=${au.screen}, SENSE=${au.sense}, LIGHT_d=${signals.d.toFixed(2)}, TONE=${signals.tone}, OK=${signals.ok.toFixed(2)}, BAND=${signals.band}.
Your job: convert subjective fog into a human utterance that keeps identity.
`;

    const userPrompt = `
USER_INPUT:
${input}

MEMORY_FACTS:
animal=${memory?.facts?.animal?.v || "null"}
city=${memory?.facts?.city?.v || "null"}

TOPICS:
${Object.keys(memory?.topics || {}).slice(0, 12).join(", ")}

TASK:
Produce a single closed intervention consistent with the archetype.
If user asks "who are you" respond with identity in-character (no generic AI disclaimers).
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system.trim() },
          { role: "user", content: userPrompt.trim() }
        ],
        temperature: 0.65
      })
    });

    if (!res.ok) {
      return NextResponse.json({
        output: lang === "ca" ? "El silenci també és un gest." : lang === "en" ? "Silence is also a gesture." : "El silencio también es un gesto.",
        au: { ...au, signals },
        session: next,
        meta: { archetype: key, historical: true }
      });
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

    return NextResponse.json({
      output: out,
      au: { ...au, signals },
      session: next,
      meta: { archetype: key, historical: true }
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null });
  }
}

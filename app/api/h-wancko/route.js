import { NextResponse } from "next/server";

/** =========================================================
 *  H-WANCKO — Historical Operator (Mirror AU) + CSA v0.1
 *  - Sesión separada de Wancko
 *  - Memoria implícita propia (recuerda sin “Recuerda:”)
 *  - Paleta día → violeta → noche (d = luz) + texto legible
 *  - Arquetipos humanos (LLM) sin muletillas repetidas
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function norm(s) {
  return String(s || "").trim();
}
function normLower(s) {
  return norm(s).toLowerCase();
}
function safeLangFromHeader(req) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return l === "es" || l === "ca" || l === "en" ? l : "en";
}
function nowTs() {
  return Date.now();
}

/* ---------------- CSA (same structure, separate session) ---------------- */

function initCSA() {
  return {
    facts: {},
    entities: {},
    timeline: [],
    stats: { turns: 0, drift: 0.18, novelty: 0.25 }
  };
}

function csaDecay(csa) {
  for (const k of Object.keys(csa.facts || {})) {
    csa.facts[k].ttl -= 1;
    if (csa.facts[k].ttl <= 0) delete csa.facts[k];
  }
  for (const t of Object.keys(csa.entities || {})) {
    for (const v of Object.keys(csa.entities[t] || {})) {
      csa.entities[t][v].ttl -= 1;
      if (csa.entities[t][v].ttl <= 0) delete csa.entities[t][v];
    }
    if (Object.keys(csa.entities[t] || {}).length === 0) delete csa.entities[t];
  }
}

function csaTouchEntity(csa, type, value, turn, w = 0.55, ttl = 8) {
  if (!value) return;
  const t = String(type || "misc");
  const v = String(value).trim();
  if (!v) return;

  if (!csa.entities[t]) csa.entities[t] = {};
  const prev = csa.entities[t][v];
  csa.entities[t][v] = {
    weight: clamp01((prev?.weight ?? 0.0) * 0.55 + w * 0.7),
    ttl: Math.max(prev?.ttl ?? 0, ttl),
    lastTurn: turn
  };

  csa.timeline.push({ turn, key: `${t}:${v}`, w: csa.entities[t][v].weight });
  csa.timeline = csa.timeline.slice(-48);
}

function csaTopEntity(csa, type) {
  const bucket = csa?.entities?.[type];
  if (!bucket) return null;
  let best = null;
  for (const [v, meta] of Object.entries(bucket)) {
    const score = (meta?.weight ?? 0) + (meta?.ttl ?? 0) * 0.02;
    if (!best || score > best.score) best = { value: v, score, meta };
  }
  return best?.value || null;
}

function extractImplicitMemory(input) {
  const text = normLower(input);

  const animals = [
    "cabra","gorila","perro","gato","caballo","vaca","oveja","pollo","pato","conejo",
    "goat","gorilla","dog","cat","horse","cow","sheep","chicken","duck","rabbit"
  ];

  const animalMatch =
    text.match(/\b(animal)\b.*?\b(es|=|:\s*)\s*([a-záéíóúñç·lüï]+)\b/) ||
    text.match(/\b(the animal)\b.*?\b(is|=|:\s*)\s*([a-z]+)\b/);

  const cityMatch =
    text.match(/\b(ciudad)\b.*?\b(es|=|:\s*)\s*([a-záéíóúñç·lüï]+)\b/) ||
    text.match(/\b(city)\b.*?\b(is|=|:\s*)\s*([a-z]+)\b/);

  const beach = /\b(playa|platja|beach)\b/.test(text)
    ? (/\b(platja)\b/.test(text) ? "platja" : "playa")
    : null;

  const found = { animal: null, city: null, place: null };

  if (animalMatch) found.animal = animalMatch[3] || animalMatch[2];
  else {
    for (const a of animals) {
      if (text.includes(` ${a} `) || text.endsWith(` ${a}`) || text.startsWith(`${a} `)) {
        found.animal = a;
        break;
      }
    }
  }

  if (cityMatch) found.city = cityMatch[3] || cityMatch[2];
  if (beach) found.place = beach;

  return found;
}

function isMemoryQuestion(input) {
  const t = normLower(input);
  return (
    /\b(qué|que|what)\b.*\b(animal|ciudad|city|place|lugar)\b/.test(t) ||
    /\b(dime|tell me)\b.*\b(animal|ciudad|city|place|lugar)\b/.test(t) ||
    /\b(sabes|do you know)\b.*\b(donde|where)\b/.test(t)
  );
}

function answerFromMemory(input, lang, csa) {
  const t = normLower(input);

  if (/\b(animal)\b/.test(t)) {
    const a = csaTopEntity(csa, "animal");
    if (!a) return lang === "es" ? "Aún no lo tengo fijado." : lang === "ca" ? "Encara no ho tinc fixat." : "I haven’t fixed that yet.";
    return lang === "es" ? `Has dicho: ${a}.` : lang === "ca" ? `Has dit: ${a}.` : `You said: ${a}.`;
  }

  if (/\b(ciudad|city)\b/.test(t)) {
    const c = csaTopEntity(csa, "city");
    if (!c) return lang === "es" ? "Aún no lo tengo fijado." : lang === "ca" ? "Encara no ho tinc fixat." : "I haven’t fixed that yet.";
    return lang === "es" ? `Has dicho: ${c}.` : lang === "ca" ? `Has dit: ${c}.` : `You said: ${c}.`;
  }

  if (/\b(donde|where|lugar|place)\b/.test(t)) {
    const p = csaTopEntity(csa, "place");
    if (!p) return lang === "es" ? "No tengo un lugar fijado en esta conversación." : lang === "ca" ? "No tinc cap lloc fixat en aquesta conversa." : "I don’t have a place fixed in this conversation.";
    return lang === "es" ? `Has insinuado: ${p}.` : lang === "ca" ? `Has insinuat: ${p}.` : `You implied: ${p}.`;
  }

  return null;
}

/* ---------------- AU for H (mirror) ---------------- */

function parseAU(input) {
  const text = normLower(input);

  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|esgotad|buit)/.test(text) ? "DCN" : "RAV";

  // base matrix: more “poetic” defaults to 2143 for ontological questions
  let matrix = "3412";
  if (/(let go|release|soltar|prou|basta)/.test(text)) matrix = "4321";
  else if (/(should|must|debo|tengo que|cal|hauria|he de)/.test(text)) matrix = "1234";
  else if (/\?$/.test(text) || /(qué es|que es|what is|qui ets|who are you|exist)/.test(text)) matrix = "2143";

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N2";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  // Mirror sense: keep sense but H uses it as “voice operator”
  const sense = matrix === "2143" ? "inverse" : "direct";

  return { screen, matrix, sense, N_level };
}

// Map Wancko-like d to LIGHT (mirror)
function hSignals(au, prevSession, csa) {
  // Wancko base d
  let d_base =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.46 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.82 :
    0.46;

  if (au.screen === "DCN") d_base += 0.08;
  d_base = clamp01(d_base);

  // Mirror: light is inverse of rupture
  let d = clamp01(1 - d_base);

  // CSA influence: H values “omnipresent”—lower novelty => more day
  const novelty = typeof csa?.stats?.novelty === "number" ? csa.stats.novelty : 0.25;
  d += (0.30 - novelty) * 0.20;
  d = clamp01(d);

  let tone = "violet";
  if (d >= 0.68) tone = "day";
  if (d <= 0.32) tone = "night";

  return { d, tone };
}

function updateCycle(prevCycle, au, signals, csa) {
  const base = prevCycle && typeof prevCycle === "object" ? prevCycle : { band: 1, ok_live: 0.5 };

  const novelty = typeof csa?.stats?.novelty === "number" ? csa.stats.novelty : 0.25;
  let ok = typeof base.ok_live === "number" ? base.ok_live : 0.5;

  // H OK: rewards “structural consistency” (low novelty)
  ok += (0.30 - novelty) * 0.25;
  if (au.N_level === "N0") ok -= 0.18;
  ok = ok * 0.92 + 0.5 * 0.08;
  ok = clamp01(ok);

  // band by LIGHT d
  let band = 2;
  const d = signals.d;
  if (d < 0.30) band = 4;
  else if (d < 0.55) band = 3;
  else if (d < 0.78) band = 2;
  else band = 1;

  return { band, ok_live: ok };
}

function nextSession(prev, au, signals, csa, cycle) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 2,
    turns: (base.turns || 0) + 1,
    last: { ...au, signals },
    csa,
    cycle,
    chain: [
      ...chain.slice(-29),
      { t: nowTs(), matrix: au.matrix, N: au.N_level, d: signals.d }
    ]
  };
}

/* ---------------- LLM (H-Wancko human voice) ---------------- */

const ARCHETYPES = {
  estoic: {
    name: "Stoic",
    style: "clear, grounded, minimal ego, disciplined, calm authority",
    constraints: "No therapy. No advice. No reassurance. No cheerleading. No follow-up invitation."
  },
  mystic: {
    name: "Mystic",
    style: "symbolic, lucid, precise, not vague; speaks like a human with inner sight",
    constraints: "No therapy. No advice. No reassurance. No follow-up invitation."
  },
  warrior: {
    name: "Warrior",
    style: "direct, concrete, decisive, honors cost and duty; not aggressive",
    constraints: "No therapy. No advice. No reassurance. No follow-up invitation."
  },
  poet: {
    name: "Poet",
    style: "sensory, exact imagery, no clichés; human warmth without comfort",
    constraints: "No therapy. No advice. No reassurance. No follow-up invitation."
  }
};

async function hLLM({ input, lang, archetype, au, signals, memoryHints }) {
  const A = ARCHETYPES[archetype] || ARCHETYPES.estoic;

  const system = `You are H-Wancko, a historical operator.
You speak as a human voice (${A.name}). Style: ${A.style}.
Constraints: ${A.constraints}
Never repeat stock phrases. Avoid slogans. Avoid meta talk.`;

  const prompt = `
LANG: ${lang}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
N: ${au.N_level}
LIGHT_D: ${signals.d.toFixed(2)}
TONE: ${signals.tone}

MEMORY_HINTS (use only if relevant, do not invent):
${memoryHints}

RULES:
- One short human utterance (1–4 sentences)
- 18–70 words
- No advice / reassurance / follow-up invitation

USER:
${input}
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
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: 0.65
    })
  });

  if (!res.ok) return "—";
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "—";
}

/* ---------------- API ---------------- */

export async function POST(req) {
  try {
    const { input, archetype, session } = await req.json();

    if (!input || norm(input).length < 2) {
      return NextResponse.json({ output: null, au: null, session: session || null });
    }

    const lang = safeLangFromHeader(req);
    const key = ARCHETYPES[archetype] ? archetype : "estoic";

    // CSA
    const prevCSA = session?.csa && typeof session.csa === "object" ? session.csa : initCSA();
    const turn = (session?.turns || 0) + 1;
    const csa = JSON.parse(JSON.stringify(prevCSA));
    csaDecay(csa);
    csa.stats.turns = turn;

    const found = extractImplicitMemory(input);
    if (found.animal) csaTouchEntity(csa, "animal", found.animal, turn, 0.78, 14);
    if (found.city) csaTouchEntity(csa, "city", found.city, turn, 0.72, 12);
    if (found.place) csaTouchEntity(csa, "place", found.place, turn, 0.62, 9);

    const recent = Array.isArray(csa.timeline) ? csa.timeline.slice(-10) : [];
    const uniq = new Set(recent.map((x) => x.key));
    const novelty = clamp01(uniq.size / 10);
    csa.stats.novelty = novelty;
    csa.stats.drift = clamp01(novelty * 0.45 + 0.15);

    // AU
    const au = parseAU(input);
    const signals = hSignals(au, session, csa);
    const cycle = updateCycle(session?.cycle, au, signals, csa);
    const newSession = nextSession(session, au, signals, csa, cycle);

    // Memory Q
    const memQ = isMemoryQuestion(input);
    if (memQ) {
      const m = answerFromMemory(input, lang, csa);
      if (m) {
        return NextResponse.json({
          output: m,
          au: { ...au, signals: { ...signals, ok: cycle.ok_live } },
          session: newSession
        });
      }
    }

    const memoryHints = [
      `animal=${csaTopEntity(csa, "animal") || "—"}`,
      `city=${csaTopEntity(csa, "city") || "—"}`,
      `place=${csaTopEntity(csa, "place") || "—"}`
    ].join("\n");

    const out = await hLLM({
      input,
      lang,
      archetype: key,
      au,
      signals,
      memoryHints
    });

    return NextResponse.json({
      output: out,
      au: { ...au, signals: { ...signals, ok: cycle.ok_live } },
      session: newSession,
      meta: { archetype: key, historical: true }
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null
    });
  }
}

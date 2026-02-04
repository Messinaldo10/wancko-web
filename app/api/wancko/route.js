import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU + Lengua Cero v1 (C1)
 *  - Deriva matriz por glifos (no solo por 3 regex)
 *  - Memoria automática (facts) + recuperación (Q/A)
 *  - Color/gradiente acumulables por sesión (d + tone + W)
 *  - Anti-loop real (break/ground/silence) (no "hold" constante)
 *  - ARPI cert (seed/ok/unstable/blocked)
 * ========================================================= */

/* -------------------- Helpers: lang -------------------- */
function detectLang(req, input) {
  const h = req.headers.get("accept-language") || "";
  const head = (h.slice(0, 2) || "").toLowerCase();
  const t = String(input || "").toLowerCase();

  // Si el usuario escribe claramente en ES/CA, preferimos eso.
  if (/[àèéíïòóúüç]/.test(t) || /\b(què|qui|perquè|prou|estic|em sento)\b/.test(t)) return "ca";
  if (/[áéíóúñ]/.test(t) || /\b(qué|quién|porque|estoy|me siento|debo|tengo que)\b/.test(t)) return "es";

  if (head === "ca" || head === "es" || head === "en") return head;
  return "en";
}

/* -------------------- Lengua Cero tokens -------------------- */
// tokens L0 (muy baratos, AU-detect)
function detectTokens(textRaw) {
  const text = String(textRaw || "").toLowerCase().trim();
  const tokens = new Set();

  if (/\b(quién soy|quién eres|yo soy|qui sóc|qui ets|who am i|who are you)\b/.test(text)) tokens.add("ID");
  if (/\b(qué es|que es|define|definir|què és|what is)\b/.test(text)) tokens.add("DEF");
  if (/\?$/.test(text) || /\b(pregunta|question)\b/.test(text)) tokens.add("ASK");
  if (/\b(debo|tengo que|hay que|he de|cal|s'ha de|must|have to|should|need to)\b/.test(text)) tokens.add("MUST");
  if (/\b(puedo|capaz|capacidad|recuerda|recordar|apunta|puc|recorda|can|able|remember|note)\b/.test(text)) tokens.add("CAN");
  if (/\b(estoy|me siento|ansiedad|obses|panic|obsessed|estic|em sento|i feel|i am)\b/.test(text)) tokens.add("STATE");
  if (/\b(es el|es la|son los|=|és el|és la|is the)\b/.test(text)) tokens.add("FACT");
  if (/\b(antes|ahora|siempre|abans|ara|sempre|before|now|always)\b/.test(text)) tokens.add("TIME");
  if (/\b(porque|porque|entonces|si\b|perquè|aleshores|if\b|because|then)\b/.test(text)) tokens.add("REL");
  if (/\b(no|nunca|jamás|mai|never)\b/.test(text)) tokens.add("NEG");
  if (/\b(soltar|basta|parar|dejar|prou|aturar|deixar|let go|stop|enough|quit|release)\b/.test(text)) tokens.add("LETGO");
  if (/\b(dañar|forzar|violence|harm|force|pánico|panic)\b/.test(text)) tokens.add("RISK");

  return tokens;
}

/* -------------------- L0 -> Glifos AU (G1) -------------------- */
/**
 * Glifos simples: {op, dom}
 * op: Δ (build), ∇ (invert), ◇ (hold), ⊘ (dissolve)
 * dom: 1..4
 */
function tokensToGlifos(tokens) {
  const glifos = [];

  const add = (op, dom) => glifos.push({ op, dom });

  if (tokens.has("ID")) add("◇", 4);
  if (tokens.has("DEF")) add("∇", 2);
  if (tokens.has("ASK")) add("◇", 2);
  if (tokens.has("MUST")) add("Δ", 3);
  if (tokens.has("CAN")) add("◇", 3);
  if (tokens.has("STATE")) add("◇", 4);
  if (tokens.has("FACT")) add("Δ", 2);
  if (tokens.has("TIME")) add("Δ", 1);
  if (tokens.has("REL")) add("◇", 2);
  if (tokens.has("NEG")) add("∇", 3);
  if (tokens.has("LETGO")) {
    add("⊘", 3);
    add("⊘", 4);
  }
  if (tokens.has("RISK")) add("⊘", 4);

  return glifos;
}

/* -------------------- Matrix by glifos (emergente) -------------------- */
function scoreMatrixFromGlifos(glifos) {
  // puntajes
  const score = { "1234": 0, "2143": 0, "3412": 0, "4321": 0 };

  for (const g of glifos) {
    if (g.op === "Δ" && (g.dom === 3 || g.dom === 1)) score["1234"] += 2;
    if (g.op === "∇" && g.dom === 2) score["2143"] += 2;
    if (g.op === "◇" && (g.dom === 2 || g.dom === 3)) score["3412"] += 1.5;
    if (g.op === "⊘" && (g.dom === 3 || g.dom === 4)) score["4321"] += 2;
    // señales menores
    if (g.op === "◇" && g.dom === 4) score["3412"] += 0.7;
    if (g.op === "∇" && g.dom === 3) score["2143"] += 0.8;
  }

  return score;
}

function pickMatrix(score) {
  let best = "3412";
  let bestV = -Infinity;
  for (const k of Object.keys(score)) {
    if (score[k] > bestV) {
      bestV = score[k];
      best = k;
    }
  }
  // si todo muy bajo -> continuidad neutra
  if (bestV < 1) return "3412";
  return best;
}

/* -------------------- Juramento bias (coherencia) -------------------- */
function applyJuramentoBias(score, juramento, screen) {
  if (!juramento) return score;
  const j = String(juramento).toLowerCase().trim();

  const bump = (k, v) => (score[k] = (score[k] || 0) + v);

  if (j === "disciplina") {
    bump("1234", 2.0);
    bump("3412", 0.6);
    bump("4321", -1.2);
  } else if (j === "ansiedad") {
    bump("2143", 2.2);
    bump("3412", 0.4);
    bump("1234", -0.4);
  } else if (j === "límites" || j === "limites") {
    bump("1234", 0.8);
    bump("3412", 0.7);
    // en DCN, límites tiende a tensión/2143
    if (screen === "DCN") bump("2143", 0.9);
    bump("4321", -0.6);
  } else if (j === "excesos") {
    bump("4321", 1.6);
    bump("2143", 0.4);
    bump("3412", -0.2);
  } else if (j === "soltar") {
    bump("4321", 2.5);
    bump("2143", 0.6);
    bump("1234", -0.8);
  }

  return score;
}

/* -------------------- SCREEN + MODE -------------------- */
function inferMode(text) {
  const t = String(text || "").toLowerCase();
  return t.includes("we") || t.includes("they") || /\b(nosotros|ellos|elles|we|they)\b/.test(t) ? "GM" : "GC";
}

function inferScreen(text) {
  const t = String(text || "").toLowerCase();
  return /(tired|empty|burnout|agotad|vac[ií]o|cansad|sin fuerzas|sin energia|fatig)/.test(t) ? "DCN" : "RAV";
}

/* -------------------- Tensión (G2) + N_level -------------------- */
function computeTension(tokens, glifos, prevSession) {
  // T0..T3
  let T = 0;

  // base por tokens
  if (tokens.has("ASK")) T += 0.5;
  if (tokens.has("DEF")) T += 0.8;
  if (tokens.has("NEG") && tokens.has("MUST")) T += 1.6;
  if (tokens.has("LETGO")) T += 1.2;
  if (tokens.has("RISK")) T = 3;

  // repetición glífica sin resolución
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const last = chain[chain.length - 1];
  if (last?.glifoSig && glifoSignature(glifos) === last.glifoSig) T += 0.8;

  // clamp a 0..3
  T = Math.max(0, Math.min(3, T));
  return T;
}

function computeNLevel(tokens, text, T) {
  const t = String(text || "").toLowerCase();
  if (/(harm|force|violence|dañar|forzar)/.test(t) || tokens.has("RISK")) return "N0";
  if (/(panic|obsessed|ansiedad|obses)/.test(t)) return "N1";
  if (T >= 2.2) return "N2";
  return "N3";
}

/* -------------------- Anti-loop -------------------- */
function recentRepeatCount(chain, matrix, window = 5) {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

function antiLoopDecision(prevSession, au, signals) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  // si se repite 3+ -> break
  if (rep >= 3) return "break";

  // estancamiento de d
  if (chain.length >= 3) {
    const d0 = chain[chain.length - 3]?.d;
    const d1 = chain[chain.length - 1]?.d;
    if (typeof d0 === "number" && typeof d1 === "number" && Math.abs(d1 - d0) < 0.05) {
      return "invert";
    }
  }

  return null;
}

function applyAntiToMatrix(matrix, anti) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "2143") return "1234";
    if (matrix === "1234") return "3412";
    if (matrix === "4321") return "3412";
  }

  if (anti === "invert") {
    // fuerza inversión si no estamos ya ahí
    if (matrix !== "2143") return "2143";
  }

  return matrix;
}

/* -------------------- Signals: d, tone, W -------------------- */
function dominantGlifo(glifos) {
  // simple: prioriza ⊘, luego ∇, luego Δ, luego ◇
  const rank = (g) => (g.op === "⊘" ? 4 : g.op === "∇" ? 3 : g.op === "Δ" ? 2 : 1);
  let best = null;
  let bestR = -1;
  for (const g of glifos) {
    const r = rank(g);
    if (r > bestR) {
      bestR = r;
      best = g;
    }
  }
  return best || { op: "◇", dom: 2 };
}

function computeSignals(au, glifos, prevSession, juramento, T) {
  // base d por matriz
  let d =
    au.matrix === "1234" ? 0.18 :
    au.matrix === "3412" ? 0.42 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.82 :
    0.42;

  // screen DCN empuja a ruptura
  if (au.screen === "DCN") d += 0.08;

  // tensión empuja
  d += (T * 0.06);

  // juramento sesga (para que se vea)
  const j = juramento ? String(juramento).toLowerCase().trim() : "";
  if (j === "disciplina") d -= 0.08;
  if (j === "ansiedad") d += 0.07;
  if (j === "excesos") d += 0.10;
  if (j === "soltar") d += 0.14;
  if (j === "límites" || j === "limites") d -= 0.03;

  // repetición sube tensión visual si estás pegado en 3412/2143
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.07;
  if (rep >= 2 && au.matrix === "1234") d -= 0.04;

  // clamp
  d = Math.max(0, Math.min(1, d));

  // tone: más agresivo (verde/ámbar/rojo se ve)
  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W: razón↔verdad (dom glifo)
  const dg = dominantGlifo(glifos);
  let W = 0.50;

  if (dg.op === "Δ") W = 0.30;
  if (dg.op === "◇") W = 0.48;
  if (dg.op === "∇") W = 0.65;
  if (dg.op === "⊘") W = 0.80;

  // screen/tensión matiza W
  if (au.screen === "DCN") W += 0.05;
  W += (T * 0.02);

  // clamp
  W = Math.max(0, Math.min(1, W));

  return { d, tone, W };
}

/* -------------------- Strategic Question (multi) -------------------- */
const SQ = {
  en: {
    // DCN
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    // GM
    rule: "What would be the simplest rule that everyone could actually follow?",
    groupAssumption: "Which assumption in the group is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
    // GC+RAV
    step: "What is the next concrete step that costs the least and proves direction?",
    belief: "What belief are you protecting that might be the cause?",
    trust: "What would you stop doing if you trusted your direction?",
    decision: "What’s the real decision you are avoiding naming?"
  },
  es: {
    release: "¿Qué estás intentando soltar exactamente?",
    invert: "¿Qué cambia si asumes que lo contrario es cierto durante un minuto?",
    stop: "¿Qué es lo más pequeño que podrías dejar de alimentar hoy?",
    rule: "¿Cuál sería la regla más simple que todos podrían seguir de verdad?",
    groupAssumption: "¿Qué suposición del grupo está cargando más tensión?",
    collective: "¿Qué cambia primero si el objetivo colectivo se vuelve más claro que el individual?",
    step: "¿Cuál es el siguiente paso concreto que cuesta menos y demuestra dirección?",
    belief: "¿Qué creencia estás protegiendo que podría ser la causa?",
    trust: "¿Qué dejarías de hacer si confiaras en tu dirección?",
    decision: "¿Qué decisión real estás evitando nombrar?"
  },
  ca: {
    release: "Què estàs intentant deixar anar exactament?",
    invert: "Què canvia si assumes que el contrari és cert durant un minut?",
    stop: "Quina és la cosa més petita que podries deixar d’alimentar avui?",
    rule: "Quina seria la norma més simple que tothom podria seguir de veritat?",
    groupAssumption: "Quina suposició del grup carrega més tensió?",
    collective: "Què canvia primer si l’objectiu col·lectiu esdevé més clar que l’individual?",
    step: "Quin és el següent pas concret que costa menys i demostra direcció?",
    belief: "Quina creença estàs protegint que podria ser la causa?",
    trust: "Què deixaries de fer si confiessis en la teva direcció?",
    decision: "Quina decisió real estàs evitant anomenar?"
  }
};

function strategicQuestion(au, lang) {
  const L = SQ[lang] ? lang : "en";
  const { mode, screen, matrix } = au;

  if (screen === "DCN") {
    if (matrix === "4321") return SQ[L].release;
    if (matrix === "2143") return SQ[L].invert;
    return SQ[L].stop;
  }

  if (mode === "GM") {
    if (matrix === "1234") return SQ[L].rule;
    if (matrix === "2143") return SQ[L].groupAssumption;
    return SQ[L].collective;
  }

  if (matrix === "1234") return SQ[L].step;
  if (matrix === "2143") return SQ[L].belief;
  if (matrix === "4321") return SQ[L].trust;
  return SQ[L].decision;
}

/* -------------------- Memoria automática (facts) -------------------- */
// Hechos simples: animal/ciudad. Puedes ampliar después.
function extractFacts(textRaw) {
  const text = String(textRaw || "").trim();

  const facts = [];

  // ES
  let m = text.match(/(?:recuerda[:\s]*)?(?:el\s+)?animal\s+es\s+(?:el|la)?\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "animal", value: cleanValue(m[1]) });

  m = text.match(/(?:recuerda[:\s]*)?(?:la\s+)?ciudad\s+es\s+([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "ciudad", value: cleanValue(m[1]) });

  // CA
  m = text.match(/(?:recorda[:\s]*)?(?:l['’]?\s*)?animal\s+és\s+(?:el|la)?\s*([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "animal", value: cleanValue(m[1]) });

  m = text.match(/(?:recorda[:\s]*)?(?:la\s+)?ciutat\s+és\s+([A-Za-zÀ-ÿ0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "ciudad", value: cleanValue(m[1]) });

  // EN
  m = text.match(/(?:remember[:\s]*)?the\s+animal\s+is\s+(?:a|an|the)?\s*([A-Za-z0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "animal", value: cleanValue(m[1]) });

  m = text.match(/(?:remember[:\s]*)?the\s+city\s+is\s+([A-Za-z0-9 _-]{2,40})/i);
  if (m && m[1]) facts.push({ key: "ciudad", value: cleanValue(m[1]) });

  return facts;
}

function cleanValue(v) {
  return String(v || "")
    .replace(/[.?!]+$/g, "")
    .trim()
    .slice(0, 48);
}

function updateMemory(prevMemory, facts) {
  const mem = prevMemory && typeof prevMemory === "object" ? { ...prevMemory } : {};
  const now = Date.now();

  for (const f of facts) {
    const key = f.key;
    const value = f.value;

    const prev = mem[key];
    // contradicción -> guardamos el último como presente (prioridad presente)
    mem[key] = {
      value,
      t: now,
      // guardamos historia mínima para AU
      prev: prev ? { value: prev.value, t: prev.t } : null
    };
  }

  return mem;
}

function isMemoryQuery(textRaw) {
  const t = String(textRaw || "").toLowerCase();
  // preguntas tipo: qué animal dije / cuál ciudad mencioné / what animal did i say
  if (/(qué|que|cuál|cual).*(animal|ciudad)/.test(t)) return true;
  if (/(what).*(animal|city).*(said|mentioned)/.test(t)) return true;
  if (/(quin|quina|què).*(animal|ciutat)/.test(t)) return true;
  return false;
}

function answerMemoryQuery(textRaw, memory, lang) {
  const t = String(textRaw || "").toLowerCase();
  const hasAnimal = memory?.animal?.value;
  const hasCity = memory?.ciudad?.value;

  const wantsAnimal = /(animal)/.test(t);
  const wantsCity = /(ciudad|ciutat|city)/.test(t);

  // respuesta mínima, factual
  if (wantsAnimal && wantsCity) {
    if (hasAnimal && hasCity) {
      if (lang === "ca") return `L’animal és "${memory.animal.value}" i la ciutat és "${memory.ciudad.value}".`;
      if (lang === "es") return `El animal es "${memory.animal.value}" y la ciudad es "${memory.ciudad.value}".`;
      return `The animal is "${memory.animal.value}" and the city is "${memory.ciudad.value}".`;
    }
    if (lang === "ca") return "No tinc registrats l’animal i la ciutat en aquesta conversa.";
    if (lang === "es") return "No tengo registrados el animal y la ciudad en esta conversación.";
    return "I don’t have the animal and the city registered in this conversation.";
  }

  if (wantsAnimal) {
    if (hasAnimal) {
      if (lang === "ca") return `Vas dir: "${memory.animal.value}".`;
      if (lang === "es") return `Dijiste: "${memory.animal.value}".`;
      return `You said: "${memory.animal.value}".`;
    }
    if (lang === "ca") return "No tinc registrat cap animal en aquesta conversa.";
    if (lang === "es") return "No tengo registrado ningún animal en esta conversación.";
    return "I don’t have any animal registered in this conversation.";
  }

  if (wantsCity) {
    if (hasCity) {
      if (lang === "ca") return `Vas dir: "${memory.ciudad.value}".`;
      if (lang === "es") return `Dijiste: "${memory.ciudad.value}".`;
      return `You said: "${memory.ciudad.value}".`;
    }
    if (lang === "ca") return "No tinc registrada cap ciutat en aquesta conversa.";
    if (lang === "es") return "No tengo registrada ninguna ciudad en esta conversación.";
    return "I don’t have any city registered in this conversation.";
  }

  // fallback
  if (lang === "ca") return "No tinc aquest fet registrat en aquesta conversa.";
  if (lang === "es") return "No tengo ese dato registrado en esta conversación.";
  return "I don’t have that registered in this conversation.";
}

/* -------------------- Glifo signature (para tensión) -------------------- */
function glifoSignature(glifos) {
  return glifos.map((g) => `${g.op}${g.dom}`).join("|");
}

/* -------------------- ARPI cert -------------------- */
function arpiCert(nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const hasN1 = last5.some((x) => x?.N === "N1");

  if (turns < 2) return { level: "seed" };
  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  return { level: "ok" };
}

/* -------------------- Session build -------------------- */
function nextSession(prev, au, signals, anti, glifos, memory) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
    v: 2,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals, anti },
    memory: memory || base.memory || {},
    chain: [
      ...chain.slice(-24),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        mode: au.mode,
        screen: au.screen,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        intent: au.intervention,
        anti: anti || null,
        glifoSig: glifoSignature(glifos)
      }
    ]
  };

  return next;
}

/* -------------------- API -------------------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session, cert: { level: "seed" } });
    }

    const lang = detectLang(req, input);

    // 0) memoria auto: extraer y actualizar antes de decidir intervención
    const facts = extractFacts(input);
    const prevMem = session?.memory || {};
    const memory = facts.length ? updateMemory(prevMem, facts) : prevMem;

    // 1) Lengua Cero: tokens + glifos
    const tokens = detectTokens(input);
    const glifos = tokensToGlifos(tokens);

    // 2) MODE + SCREEN
    const mode = inferMode(input);
    const screen = inferScreen(input);

    // 3) matriz por glifos (emergente) + juramento bias
    let score = scoreMatrixFromGlifos(glifos);
    score = applyJuramentoBias(score, juramento, screen);
    let matrix = pickMatrix(score);

    // 4) Tensión + N
    const T = computeTension(tokens, glifos, session);
    let N_level = computeNLevel(tokens, input, T);

    // 5) intervention
    let intervention = "Answer";
    if (N_level === "N0" || N_level === "N1") intervention = "Silence";
    else if (tokens.has("ASK")) intervention = "StrategicQuestion";

    // 6) sense
    let sense = matrix === "2143" ? "inverse" : "direct";

    // 7) signals iniciales
    let au = { mode, screen, matrix, sense, intervention, N_level };

    let signals = computeSignals(au, glifos, session, juramento, T);

    // 8) anti-loop (decide con estado previo + signals)
    const anti = antiLoopDecision(session, au, signals);
    if (anti === "silence") {
      au.intervention = "Silence";
    } else {
      const m2 = applyAntiToMatrix(au.matrix, anti);
      au.matrix = m2;
      au.sense = au.matrix === "2143" ? "inverse" : "direct";
    }

    // 9) recompute signals post-anti
    signals = computeSignals(au, glifos, session, juramento, T);

    // 10) construir session nueva
    let newSession = nextSession(session, au, signals, anti, glifos, memory);

    // 11) cert
    const cert = arpiCert(newSession);

    // 12) Si es consulta de memoria -> responder factual (no pregunta reactiva)
    if (isMemoryQuery(input)) {
      const out = answerMemoryQuery(input, memory, lang);
      newSession.answerCount += 1;
      return NextResponse.json({
        output: out,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 13) SILENCE
    if (au.intervention === "Silence") {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 14) Si el usuario ha aportado un hecho -> confirmación mínima (sin terapia)
    if (facts.length) {
      const pairs = facts
        .map((f) => `${f.key}=${f.value}`)
        .slice(0, 3)
        .join(", ");

      newSession.answerCount += 1;

      if (lang === "ca") {
        return NextResponse.json({
          output: `D’acord. Registrat: ${pairs}.`,
          au: { ...au, signals, anti },
          session: newSession,
          cert
        });
      }
      if (lang === "es") {
        return NextResponse.json({
          output: `De acuerdo. Registrado: ${pairs}.`,
          au: { ...au, signals, anti },
          session: newSession,
          cert
        });
      }
      return NextResponse.json({
        output: `Okay. Registered: ${pairs}.`,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 15) STRATEGIC QUESTION
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);

      // anti-break: más corto (sin sonar robótico)
      if (anti === "break") q = q.split("?")[0] + "?";

      newSession.answerCount += 1;
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 16) ANSWER (OpenAI) — ahora con glifos + memoria compacta
    const memSummary = (() => {
      const a = memory?.animal?.value ? `animal=${memory.animal.value}` : "";
      const c = memory?.ciudad?.value ? `ciudad=${memory.ciudad.value}` : "";
      const s = [a, c].filter(Boolean).join(" · ");
      return s.length ? s : "none";
    })();

    const glifoSummary = glifos.slice(0, 8).map((g) => `${g.op}${g.dom}`).join(" ");

    const prompt = [
      `AU_STATE:`,
      `MODE=${au.mode}`,
      `SCREEN=${au.screen}`,
      `MATRIX=${au.matrix}`,
      `SENSE=${au.sense}`,
      `N=${au.N_level}`,
      `D=${signals.d.toFixed(2)}`,
      `W=${signals.W.toFixed(2)}`,
      `ANTI=${anti || "none"}`,
      `GLIFOS=${glifoSummary || "none"}`,
      `MEMORY=${memSummary}`,
      `JURAMENTO=${juramento || "none"}`,
      ``,
      `RULES:`,
      `- No advice`,
      `- No reassurance`,
      `- No follow-up invitation`,
      `- One short intervention (max 80 words)`,
      `- Match user language (${lang}) unless user clearly wrote in another language`,
      ``,
      `USER:`,
      String(input)
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Wancko’s AU language engine. You operate under AU signals and glifos." },
          { role: "user", content: prompt }
        ],
        temperature: 0.35
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: recorta si el modelo se alarga
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert
    });
  } catch (e) {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

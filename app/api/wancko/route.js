import { NextResponse } from "next/server";

/** =========================================================
 * WANCKO API — AU v0.6 (conversacional + memoria declarativa)
 * - Memoria declarativa (facts) opt-in
 * - Preguntas factuales NO saltan a StrategicQuestion
 * - Matrices/N se mueven más (coherencia + deriva determinista)
 * - Anti-loop útil (no “hold” constante)
 * - ARPI cert (seed/ok/unstable/blocked)
 * ========================================================= */

const MAX_CHAIN = 24;
const MAX_FACTS = 32;

/* ----------------- util: idioma ----------------- */
function pickLang(req, fallback = "es") {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return ["es", "ca", "en"].includes(l) ? l : fallback;
}

/* ----------------- util: hash determinista ----------------- */
function hash01(str) {
  // devuelve 0..1 estable para dar “vida” sin aleatoriedad real
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // normalizar
  const x = (h >>> 0) / 4294967295;
  return x;
}

/* ----------------- Memoria declarativa (facts) ----------------- */
function detectMemoryCommand(text) {
  // Opt-in: “recuerda/guarda/memoriza/apunta/remember/store”
  return /(recuerda|guarda|memoriza|apunta|remember|store|save)\b/i.test(text);
}

function extractFacts(text) {
  // Extrae hechos simples, sin inventar.
  // Formatos típicos:
  // - "Recuerda: el animal es el gorila"
  // - "Guarda que mi nombre es X"
  // - "Remember: my animal is gorilla"
  const t = text.trim();

  const facts = [];

  // animal
  let m =
    t.match(/(?:animal)\s*(?:es|=|:)\s*([a-záéíóúüñç·\-\s]{2,40})/i) ||
    t.match(/(?:my\s+animal)\s*(?:is|=|:)\s*([a-z\-\s]{2,40})/i);
  if (m && m[1]) {
    facts.push({ key: "animal", value: m[1].trim() });
  }

  // nombre
  m =
    t.match(/(?:me\s+llamo|mi\s+nombre\s+es|nom\s+és)\s*([a-záéíóúüñç·\-\s]{2,40})/i) ||
    t.match(/(?:my\s+name\s+is)\s*([a-z\-\s]{2,40})/i);
  if (m && m[1]) {
    facts.push({ key: "name", value: m[1].trim() });
  }

  // lugar/ciudad
  m =
    t.match(/(?:vivo\s+en|estoy\s+en|visc\s+a)\s*([a-záéíóúüñç·\-\s]{2,60})/i) ||
    t.match(/(?:i\s+live\s+in|i\s+am\s+in)\s*([a-z\-\s]{2,60})/i);
  if (m && m[1]) {
    facts.push({ key: "place", value: m[1].trim() });
  }

  // “X es Y” genérico (solo si es explícito y corto)
  // Ej: "recuerda: código = 1234"
  m = t.match(/(?:recuerda|guarda|memoriza|apunta|remember|store|save)\s*[:\-]?\s*([a-z0-9áéíóúüñç\-\s]{2,20})\s*(?:=|:|es|is)\s*([a-z0-9áéíóúüñç\-\s]{2,40})/i);
  if (m && m[1] && m[2]) {
    const k = m[1].trim().toLowerCase().replace(/\s+/g, "_");
    const v = m[2].trim();
    if (!["animal", "name", "place"].includes(k)) {
      facts.push({ key: k, value: v });
    }
  }

  // dedup por key (último gana)
  const map = {};
  for (const f of facts) map[f.key] = f.value;
  return Object.keys(map).map((k) => ({ key: k, value: map[k] }));
}

function isFactQuestion(text) {
  // Preguntas del tipo: “qué animal dije”, “what animal”, etc.
  const t = text.toLowerCase().trim();
  return (
    /(qué|que|what)\s+(animal|nombre|name|place|lugar|ciudad)/.test(t) ||
    /(qué|que)\s+(había|dije|dicho)\s+(antes)/.test(t) ||
    /(what)\s+(did\s+i\s+say|was\s+it)\b/.test(t)
  );
}

function answerFactQuestion(text, facts, lang) {
  const t = text.toLowerCase();
  const f = facts || {};

  const say = (es, ca, en) => (lang === "ca" ? ca : lang === "en" ? en : es);

  const missing = say(
    "No tengo ese dato registrado en esta conversación.",
    "No tinc aquesta dada registrada en aquesta conversa.",
    "I don’t have that saved in this conversation."
  );

  const how = say(
    "Si quieres guardarlo, dilo como: “Recuerda: el animal es …”.",
    "Si ho vols guardar, digues: “Recorda: l’animal és …”.",
    "If you want it saved, say: “Remember: my animal is …”."
  );

  if (/animal/.test(t)) {
    if (f.animal) return say(`Dijiste: ${f.animal}.`, `Vas dir: ${f.animal}.`, `You said: ${f.animal}.`);
    return `${missing} ${how}`;
  }

  if (/(nombre|name)/.test(t)) {
    if (f.name) return say(`Dijiste: ${f.name}.`, `Vas dir: ${f.name}.`, `You said: ${f.name}.`);
    return `${missing} ${how}`;
  }

  if (/(lugar|place|ciudad)/.test(t)) {
    if (f.place) return say(`Dijiste: ${f.place}.`, `Vas dir: ${f.place}.`, `You said: ${f.place}.`);
    return `${missing} ${how}`;
  }

  return `${missing} ${how}`;
}

/* ----------------- AU core parse ----------------- */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  // MODE
  const mode = /\b(we|they|nosotros|ellos|nosaltres|ells)\b/.test(text) ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad|colaps|sin\s+fuerzas)/.test(text)
      ? "DCN"
      : "RAV";

  // MATRIX
  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)\b/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)\b/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)\b/.test(text)
  ) {
    matrix = "2143";
  } else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)\b/.test(text)
  ) {
    matrix = "4321";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|ataque|pánico|panico)\b/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|matar|suicid)/.test(text)) N_level = "N0";

  // degradación suave si pregunta corta repetitiva
  if (/\?$/.test(text) && text.length < 44 && N_level === "N3") N_level = "N2";

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";
  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ----------------- Strategic Questions (multi) ----------------- */
const SQ = {
  es: {
    release: "¿Qué estás intentando soltar exactamente?",
    invert: "¿Qué cambia si asumes que lo contrario es cierto durante un minuto?",
    stop: "¿Qué es lo más pequeño que podrías dejar de alimentar hoy?",
    rule: "¿Cuál sería la regla más simple que sí podrías cumplir hoy?",
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
    rule: "Quina seria la norma més simple que sí podries complir avui?",
    groupAssumption: "Quina suposició del grup carrega més tensió?",
    collective: "Què canvia primer si l’objectiu col·lectiu esdevé més clar que l’individual?",
    step: "Quin és el següent pas concret que costa menys i demostra direcció?",
    belief: "Quina creença estàs protegint que podria ser la causa?",
    trust: "Què deixaries de fer si confiessis en la teva direcció?",
    decision: "Quina decisió real estàs evitant anomenar?"
  },
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What is the simplest rule you could actually follow today?",
    groupAssumption: "Which group assumption is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
    step: "What is the next concrete step that costs the least and proves direction?",
    belief: "What belief are you protecting that might be the cause?",
    trust: "What would you stop doing if you trusted your direction?",
    decision: "What’s the real decision you are avoiding naming?"
  }
};

function strategicQuestion(au, lang) {
  const L = SQ[lang] ? lang : "es";
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

/* ----------------- Juramento coherencia ----------------- */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = String(juramento).toLowerCase().trim();

  if (j === "disciplina") {
    if (matrix === "4321") return "3412";
    return "1234";
  }
  if (j === "ansiedad") {
    return "2143";
  }
  if (j === "límites" || j === "limites") {
    if (screen === "DCN") return "2143";
    if (matrix === "4321") return "3412";
    return matrix;
  }
  if (j === "excesos") {
    if (matrix === "3412") return "4321";
    return matrix;
  }
  if (j === "soltar") {
    return "4321";
  }
  return matrix;
}

/* ----------------- Anti-loop ----------------- */
function recentRepeatCount(chain, matrix, window = 6) {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

function antiLoopDecision(prevSession, au) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const last6 = chain.slice(-6);

  const n0 = last6.some((x) => x?.N === "N0");
  const n1 = last6.filter((x) => x?.N === "N1").length;

  if (n0) return "silence";
  if (n1 >= 2) return "silence";

  const rep = recentRepeatCount(chain, au.matrix, 6);
  if (rep >= 3) return "break";

  // estancamiento en d (muy estable en 2143/3412)
  if (last6.length >= 4) {
    const d0 = last6[last6.length - 1]?.d;
    const d3 = last6[last6.length - 4]?.d;
    if (typeof d0 === "number" && typeof d3 === "number" && Math.abs(d0 - d3) < 0.04) {
      return "nudge";
    }
  }

  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return juramento === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "nudge") {
    // micro-rotación suave
    if (matrix === "3412") return "1234";
    if (matrix === "2143") return "3412";
  }

  return matrix;
}

/* ----------------- Signals AU (d, tone, W) ----------------- */
function auSignals(au, prevSession, juramento, seed) {
  // base d por matriz
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.60 :
    au.matrix === "4321" ? 0.82 :
    0.45;

  if (au.screen === "DCN") d += 0.09;

  const j = juramento ? String(juramento).toLowerCase().trim() : "";
  if (j === "disciplina") d -= 0.07;
  if (j === "ansiedad") d += 0.07;
  if (j === "excesos") d += 0.09;
  if (j === "soltar") d += 0.12;
  if (j === "límites" || j === "limites") d -= 0.02;

  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 6);

  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.07;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  // vida determinista por turno+input (evita quedarse clavado en centro)
  d += (seed - 0.5) * 0.06;

  d = Math.max(0, Math.min(1, d));

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // W (barra) no igual a d
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.80 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.06;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  W += (seed - 0.5) * 0.05;
  W = Math.max(0, Math.min(1, W));

  return { d, tone, sense: au.sense, W };
}

/* ----------------- ARPI cert ----------------- */
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

/* ----------------- Session ----------------- */
function normalizeSession(prev, juramento) {
  const base = prev && typeof prev === "object" ? prev : {};
  const facts = base.facts && typeof base.facts === "object" ? base.facts : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 2,
    turns: base.turns || 0,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: base.last || null,
    chain,
    facts,
    juramento: juramento ?? base.juramento ?? null
  };
}

function addFactsToSession(session, newFacts) {
  if (!newFacts || !newFacts.length) return session;

  const facts = { ...(session.facts || {}) };
  for (const f of newFacts) {
    if (!f?.key || !f?.value) continue;
    // clamp cantidad
    if (Object.keys(facts).length >= MAX_FACTS && !facts[f.key]) continue;
    facts[f.key] = String(f.value).trim();
  }
  return { ...session, facts };
}

function nextSession(prev, au, signals, anti, juramento) {
  const base = normalizeSession(prev, juramento);
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const item = {
    t: Date.now(),
    matrix: au.matrix,
    sense: au.sense,
    N: au.N_level,
    d: signals.d,
    W: signals.W,
    intent: au.intervention,
    anti: anti || null
  };

  const next = {
    ...base,
    turns: base.turns + 1,
    last: { ...au, signals, anti: anti || null },
    chain: [...chain.slice(-(MAX_CHAIN - 1)), item]
  };

  return next;
}

/* ----------------- Capacidades (para UI) ----------------- */
function capabilities(lang) {
  const say = (es, ca, en) => (lang === "ca" ? ca : lang === "en" ? en : es);
  return {
    memory: say(
      "Memoria factual: solo si la declaras con “Recuerda: …” (en esta conversación).",
      "Memòria factual: només si la declares amb “Recorda: …” (en aquesta conversa).",
      "Factual memory: only if you declare it with “Remember: …” (in this conversation)."
    ),
    limits: say(
      "No invento recuerdos. Si no está guardado, lo digo.",
      "No invento records. Si no està guardat, ho dic.",
      "I don’t invent memories. If it’s not saved, I say so."
    )
  };
}

/* ----------------- API ----------------- */
export async function POST(req) {
  try {
    const lang = pickLang(req, "es");
    const body = await req.json();

    const input = body?.input ? String(body.input) : "";
    const juramento = body?.juramento ?? null;
    const prevSession = body?.session || null;

    // semilla determinista por turno+texto
    const seed = hash01(`${(prevSession?.turns || 0) + 1}::${input}`);

    let session = normalizeSession(prevSession, juramento);

    if (!input || input.trim().length < 2) {
      // devolvemos estado base para que UI no “desaparezca”
      return NextResponse.json({
        output: null,
        au: session.last ? session.last : null,
        session,
        cert: arpiCert(session),
        capabilities: capabilities(lang)
      });
    }

    const rawText = input.trim();

    // 1) Memoria declarativa opt-in
    if (detectMemoryCommand(rawText)) {
      const facts = extractFacts(rawText);
      session = addFactsToSession(session, facts);

      const msg =
        lang === "ca"
          ? facts.length
            ? `D’acord. Ho guardo en aquesta conversa: ${facts.map((f) => `${f.key}=${f.value}`).join(", ")}.`
            : "D’acord. Però no veig cap fet clar a guardar. Exemple: “Recorda: l’animal és el goril·la”."
          : lang === "en"
          ? facts.length
            ? `OK. Saved in this conversation: ${facts.map((f) => `${f.key}=${f.value}`).join(", ")}.`
            : 'OK. But I don’t see a clear fact to save. Example: “Remember: my animal is gorilla”.'
          : facts.length
          ? `De acuerdo. Guardado en esta conversación: ${facts.map((f) => `${f.key}=${f.value}`).join(", ")}.`
          : 'De acuerdo, pero no veo un hecho claro para guardar. Ejemplo: “Recuerda: el animal es el gorila”.';

      // guardamos un evento suave en chain (sin forzar matrices)
      const au = parseAU(rawText);
      au.matrix = applyJuramento(au.matrix, juramento, au.screen);
      au.sense = au.matrix === "2143" ? "inverse" : "direct";
      const anti = antiLoopDecision(session, au);
      au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
      au.sense = au.matrix === "2143" ? "inverse" : "direct";

      const signals = auSignals(au, session, juramento, seed);
      const next = nextSession(session, au, signals, anti, juramento);
      const cert = arpiCert(next);

      return NextResponse.json({
        output: msg,
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    // 2) Pregunta factual -> responder desde facts (NO StrategicQuestion)
    if (isFactQuestion(rawText)) {
      const answer = answerFactQuestion(rawText, session.facts, lang);

      const au = parseAU(rawText);
      au.matrix = applyJuramento(au.matrix, juramento, au.screen);
      au.sense = au.matrix === "2143" ? "inverse" : "direct";
      const anti = antiLoopDecision(session, au);
      au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
      au.sense = au.matrix === "2143" ? "inverse" : "direct";

      const signals = auSignals(au, session, juramento, seed);
      const next = nextSession(session, au, signals, anti, juramento);
      next.answerCount += 1;
      const cert = arpiCert(next);

      return NextResponse.json({
        output: answer,
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    // 3) Parse AU base + coherencia
    let au = parseAU(rawText);
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 4) Anti-loop y posible ajuste
    const anti = antiLoopDecision(session, au);
    if (anti) {
      au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
      au.sense = au.matrix === "2143" ? "inverse" : "direct";
    }

    // 5) Señales
    const signals = auSignals(au, session, juramento, seed);

    // 6) Session
    let next = nextSession(session, au, signals, anti, juramento);
    const cert = arpiCert(next);

    // 7) Intervención
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";
    if (effectiveSilence) {
      next.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    if (au.intervention === "StrategicQuestion") {
      // si anti=break/nudge, la pregunta será más corta/operativa
      let q = strategicQuestion(au, lang);
      if (anti === "break") q = q.split(".")[0] + "?";
      next.answerCount += 1;
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    // 8) OpenAI (Answer)
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // fallback local (no rompe build)
      const fallback =
        lang === "ca"
          ? "Et sento. Mantén-ho simple: una cosa, un pas, ara."
          : lang === "en"
          ? "I hear you. Keep it simple: one thing, one step, now."
          : "Te escucho. Manténlo simple: una cosa, un paso, ahora.";
      next.answerCount += 1;
      return NextResponse.json({
        output: fallback,
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
ARPI: ${cert.level}

FACTS (if any, do not invent):
${Object.keys(next.facts || {}).length ? JSON.stringify(next.facts) : "none"}

RULES:
- No therapy language, no medical claims
- No reassurance loops
- One compact intervention (max 85 words)
- Match user language: ${lang}
- If user asks for a stored fact, only answer if it exists in FACTS. If not, say it's not saved.

USER:
${rawText}
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Wancko. AU-aligned. Precise. Human-sounding, not robotic." },
          { role: "user", content: prompt }
        ],
        temperature: 0.45
      })
    });

    if (!res.ok) {
      next.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti: anti || null },
        session: next,
        cert,
        capabilities: capabilities(lang)
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: acorta si se alarga demasiado
    if (anti === "break" && out.length > 140) {
      out = out.split(".")[0] + ".";
    }

    next.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti: anti || null },
      session: next,
      cert,
      capabilities: capabilities(lang)
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null,
      cert: { level: "seed" }
    });
  }
}

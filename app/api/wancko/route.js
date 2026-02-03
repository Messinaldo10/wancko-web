import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU v0.6 (conversacional + memoria + coherencia)
 *  - Memoria: "Recuerda: X es Y" (ES/CA/EN) guardado en session.memory
 *  - Recuperación: "Qué X dije / mencioné" responde desde memoria o historial local
 *  - Juramento modula matriz + tono + estilo (subjetividad AU visible)
 *  - Gradiente d + W se mueven de verdad
 *  - Anti-loop útil (break/ground/silence)
 *  - ARPI cert sin exponer datos
 * ========================================================= */

/** ---------- util ---------- */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .trim();
}

function detectLang(req) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return l === "es" || l === "ca" || l === "en" ? l : "en";
}

/** ---------- memoria (comandos) ---------- */
function parseRememberCommand(inputRaw) {
  const input = String(inputRaw || "").trim();
  const lower = input.toLowerCase().trim();

  // Formatos aceptados:
  // ES: "Recuerda: el animal es la cabra", "Recuerda que el animal es la cabra"
  // CA: "Recorda: l'animal és la cabra", "Recorda que l'animal és la cabra"
  // EN: "Remember: the animal is goat", "Remember that the animal is goat"
  const isRemember =
    lower.startsWith("recuerda:") ||
    lower.startsWith("recuerda que ") ||
    lower.startsWith("recorda:") ||
    lower.startsWith("recorda que ") ||
    lower.startsWith("remember:") ||
    lower.startsWith("remember that ");

  if (!isRemember) return null;

  // Extrae "clave es valor" lo más robusto posible
  const after =
    input.replace(/^recuerda:\s*/i, "")
      .replace(/^recuerda que\s*/i, "")
      .replace(/^recorda:\s*/i, "")
      .replace(/^recorda que\s*/i, "")
      .replace(/^remember:\s*/i, "")
      .replace(/^remember that\s*/i, "");

  // Buscar "X es Y" / "X és Y" / "X is Y"
  const m =
    after.match(/(.+?)\s+(es|és|is)\s+(.+)$/i);

  if (!m) return { ok: false, reason: "format" };

  const keyRaw = m[1].trim();
  const valueRaw = m[3].trim();

  // Normaliza clave a slug simple
  const key = keyRaw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  const value = valueRaw.slice(0, 120);

  if (!key || !value) return { ok: false, reason: "empty" };

  return { ok: true, key, value, keyRaw, valueRaw };
}

function parseRecallQuestion(inputRaw) {
  const t = norm(inputRaw);

  // Ejemplos:
  // ES: "Qué animal he dicho?", "Qué ciudad mencioné?", "Dime el animal y la ciudad guardados"
  // CA: "Quin animal he dit?", "Quina ciutat he mencionat?"
  // EN: "What animal did I say?", "Which city did I mention?"
  const wantsAll =
    /(dime|di|say|tell me|digues)\s+(el|la|the)\s+(animal|ciudad|city)\s+y\s+(la|the)\s+(ciudad|city)/.test(t) ||
    /(animal).*(ciudad|city)|(?:ciudad|city).*(animal)/.test(t) && /(guardad|saved|guardat|memor)/.test(t);

  if (wantsAll) return { type: "all" };

  // Pregunta por un concepto concreto
  const mEs = t.match(/qué\s+([a-záéíóúñü'’\- ]+?)\s+(he\s+dicho|mencioné|he\s+mencionado)/i);
  const mCa = t.match(/quin[ae]?\s+([a-zàèéíòóúüç'’\- ]+?)\s+(he\s+dit|he\s+mencionat)/i);
  const mEn = t.match(/what\s+([a-z'’\- ]+?)\s+(did i say|did i mention)/i);

  const m = mEs || mCa || mEn;
  if (!m) return null;

  const concept = m[1].trim();
  const key = concept
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  if (!key) return null;
  return { type: "one", key, concept };
}

/** ---------- AU PARSER v0.3.1 (base) ---------- */
function parseAU(input) {
  const text = norm(input);

  // MODE
  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN
  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  // MATRIX
  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  } else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)
  ) {
    matrix = "4321";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  // degradación suave por repetición conceptual
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") {
    N_level = "N2";
  }

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- STRATEGIC QUESTIONS ---------- */
const SQ = {
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule that everyone could actually follow?",
    groupAssumption: "Which assumption in the group is carrying the most tension?",
    collective: "What changes first if the collective goal becomes clearer than the individual one?",
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

/** ---------- coherencia AU: juramento como operador ---------- */
function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = norm(juramento);

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

/** ---------- repetición ---------- */
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

/** ---------- anti-loop (útil) ---------- */
function antiLoopDecision(prevSession, au) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  if (rep >= 3) return "break";

  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && au.matrix === "2143" && rep >= 2) return "ground";

  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return norm(juramento) === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "ground") return "3412";

  return matrix;
}

/** ---------- signals: d + tone + W ---------- */
function auSignals(au, prevSession, juramento) {
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.82 :
    0.45;

  if (au.screen === "DCN") d += 0.10;

  const j = juramento ? norm(juramento) : "";
  if (j === "disciplina") d -= 0.08;
  if (j === "ansiedad") d += 0.08;
  if (j === "excesos") d += 0.10;
  if (j === "soltar") d += 0.14;
  if (j === "límites" || j === "limites") d -= 0.03;

  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);

  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.08;
  if (rep >= 2 && au.matrix === "1234") d -= 0.04;
  if (rep >= 2 && au.matrix === "4321") d += 0.06;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  let W =
    au.matrix === "1234" ? 0.28 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.66 :
    au.matrix === "4321" ? 0.82 :
    0.50;

  if (au.screen === "DCN") W += 0.06;
  if (j === "disciplina") W -= 0.06;
  if (j === "soltar") W += 0.08;
  if (j === "ansiedad") W += 0.03;

  W = clamp01(W);

  return { d, tone, sense: au.sense, W };
}

/** ---------- ARPI cert ---------- */
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

/** ---------- session ---------- */
function nextSession(prev, au, signals, anti, memory, messages) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals, anti },
    memory: memory || base.memory || {},
    // mensajes (texto) se guarda SOLO en cliente; aquí solo guardamos contador
    msgCount: Array.isArray(messages) ? messages.length : (base.msgCount || 0),
    chain: [
      ...chain.slice(-24),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        intent: au.intervention,
        anti: anti || null
      }
    ]
  };
}

/** ---------- respuestas de memoria ---------- */
function memoryReply(lang, key, value) {
  if (lang === "es") return `De acuerdo. Guardado en esta conversación: ${key}=${value}.`;
  if (lang === "ca") return `D’acord. Guardat en aquesta conversa: ${key}=${value}.`;
  return `OK. Saved in this conversation: ${key}=${value}.`;
}

function memoryNotClear(lang) {
  if (lang === "es") return "De acuerdo, pero no veo un hecho claro para guardar. Ejemplo: “Recuerda: el animal es el gorila”.";
  if (lang === "ca") return "D’acord, però no veig un fet clar per guardar. Exemple: “Recorda: l’animal és el goril·la”.";
  return "OK, but I don’t see a clear fact to save. Example: “Remember: the animal is gorilla”.";
}

function recallNotFound(lang, concept) {
  if (lang === "es") return `No tengo guardado “${concept}” en esta conversación. Si quieres guardarlo, dilo como: “Recuerda: ${concept} es …”.`;
  if (lang === "ca") return `No tinc guardat “${concept}” en aquesta conversa. Si ho vols guardar, digues: “Recorda: ${concept} és …”.`;
  return `I don’t have “${concept}” saved in this conversation. To save it: “Remember: ${concept} is …”.`;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    const lang = detectLang(req);

    if (!input || String(input).trim().length < 2) {
      return NextResponse.json({
        output: null,
        au: null,
        session,
        cert: { level: "seed" }
      });
    }

    // ===== 0) Memoria: comandos =====
    const remember = parseRememberCommand(input);
    const recall = parseRecallQuestion(input);

    // Session memory local
    const baseMemory = (session && typeof session === "object" && session.memory && typeof session.memory === "object")
      ? session.memory
      : {};
    const memory = { ...baseMemory };

    if (remember) {
      if (!remember.ok) {
        return NextResponse.json({
          output: memoryNotClear(lang),
          au: null,
          session: { ...(session || null), memory },
          cert: { level: "seed" }
        });
      }

      memory[remember.key] = remember.value;

      return NextResponse.json({
        output: memoryReply(lang, remember.key, remember.value),
        au: null,
        session: { ...(session || null), memory },
        cert: { level: "seed" }
      });
    }

    if (recall) {
      if (recall.type === "all") {
        const animal = memory.animal || memory.el_animal || memory.the_animal || null;
        const city = memory.ciudad || memory.la_ciudad || memory.city || null;

        if (lang === "es") {
          return NextResponse.json({
            output: `Lo guardado es: animal=${animal ?? "—"} · ciudad=${city ?? "—"}.`,
            au: null,
            session: { ...(session || null), memory },
            cert: { level: "seed" }
          });
        }
        if (lang === "ca") {
          return NextResponse.json({
            output: `El que està guardat és: animal=${animal ?? "—"} · ciutat=${city ?? "—"}.`,
            au: null,
            session: { ...(session || null), memory },
            cert: { level: "seed" }
          });
        }
        return NextResponse.json({
          output: `Saved: animal=${animal ?? "—"} · city=${city ?? "—"}.`,
          au: null,
          session: { ...(session || null), memory },
          cert: { level: "seed" }
        });
      }

      const value = memory[recall.key];
      if (!value) {
        return NextResponse.json({
          output: recallNotFound(lang, recall.concept),
          au: null,
          session: { ...(session || null), memory },
          cert: { level: "seed" }
        });
      }

      if (lang === "es") {
        return NextResponse.json({
          output: `Dijiste: ${value}.`,
          au: null,
          session: { ...(session || null), memory },
          cert: { level: "seed" }
        });
      }
      if (lang === "ca") {
        return NextResponse.json({
          output: `Vas dir: ${value}.`,
          au: null,
          session: { ...(session || null), memory },
          cert: { level: "seed" }
        });
      }
      return NextResponse.json({
        output: `You said: ${value}.`,
        au: null,
        session: { ...(session || null), memory },
        cert: { level: "seed" }
      });
    }

    // ===== 1) AU parse base =====
    let au = parseAU(input);

    // ===== 2) Juramento operador =====
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // ===== 3) Anti-loop =====
    const anti = antiLoopDecision(session, au);

    // ===== 4) Ajuste anti-loop =====
    au.matrix = applyAntiToMatrix(au.matrix, anti, juramento);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // ===== 5) Signals =====
    const signals = auSignals(au, session, juramento);

    // ===== 6) Session =====
    let newSession = nextSession(session, au, signals, anti, memory, null);
    const cert = arpiCert(newSession);

    // ===== 7) Intervención efectiva =====
    const effectiveSilence = au.intervention === "Silence" || anti === "silence";

    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang);

      // anti=break -> recorta
      if (anti === "break") q = q.split("\n")[0];

      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // ===== 8) ANSWER (OpenAI) con estilo por juramento =====
    const j = juramento ? norm(juramento) : "none";

    const styleByJuramento = {
      none: "neutral AU, concise, not cold",
      disciplina: "structured AU, crisp, rule-like, minimal",
      ansiedad: "tension-aware AU, narrower focus, one lever",
      limites: "boundary AU, precise, protective, no moralizing",
      "límites": "boundary AU, precise, protective, no moralizing",
      excesos: "excess AU, cut-to-bone, friction, interruption",
      soltar: "release AU, disidentification, reduce attachment"
    };

    const style = styleByJuramento[j] || styleByJuramento.none;

    const prompt =
`AU_OBJECTIVITY: objective-in-AU (not mainstream, not scientific-neutral, not linguistic bias)
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${juramento || "none"}
GRADIENT_D: ${signals.d.toFixed(2)}
W: ${signals.W.toFixed(2)}
ANTI: ${anti || "none"}
CERT: ${cert.level}

RULES:
- No advice, no coaching, no therapy
- No reassurance
- No follow-up invitation
- One short intervention (max 80 words)
- Make the subjective difference visible through "AU structure", not emotions
- Style: ${style}
- Match language: ${lang}

USER:
${String(input).trim()}
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
          { role: "system", content: "You are Wancko. You operate AU coherence." },
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

    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert
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

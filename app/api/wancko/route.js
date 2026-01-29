import { NextResponse } from "next/server";

/** =========================================================
 * WANCKO API — AU v0.5 (integrado)
 * - Modos emergentes (no dependen solo del texto)
 * - Juramento sigue existiendo como “operador” (si llega, sesga)
 * - Espejo con H-Wancko (historicalMeta) modula d/W/tono y voz
 * - Anti-loop útil + ARPI intermedio al principio
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function detectLangHeader(req, input) {
  const h = req.headers.get("accept-language")?.slice(0, 2);
  const text = String(input || "");
  if (/[¿¡ñáéíóú]/i.test(text)) return "es";
  if (/[àèìòùç·]/i.test(text)) return "ca";
  return h || "en";
}

/** ---------- AU PARSER base ---------- */
function parseAU(input) {
  const text = String(input || "").toLowerCase().trim();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

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

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") {
    N_level = "N2";
  }

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/** ---------- Modos emergentes (operadores) ----------
 * Si juramento viene, se trata como “bias”.
 * Si no viene, se infiere (no UI).
 */
function inferOperator(input) {
  const t = String(input || "").toLowerCase().trim();
  if (/(ansiedad|panic|obsessed|miedo|temor|pánico|rumiar|rumia)/.test(t)) return "ansiedad";
  if (/(l[ií]mite|boundary|no quiero|no debo|stop doing|hasta aquí|basta ya)/.test(t)) return "limites";
  if (/(exceso|overdo|too much|compuls|atrac|adicc)/.test(t)) return "excesos";
  if (/(disciplina|debo|tengo que|must|should|regla|ley)/.test(t)) return "disciplina";
  if (/(soltar|dejar ir|let go|release|rendirme|rendir|prou)/.test(t)) return "soltar";
  return "neutral";
}

function normalizeJuramento(j) {
  if (!j) return null;
  const s = String(j).toLowerCase().trim();
  if (s === "límites") return "limites";
  return s;
}

/** ---------- Juramento como operador de matriz (coherencia) ---------- */
function applyOperatorToMatrix(matrix, operator, screen) {
  const op = operator || "neutral";

  if (op === "disciplina") {
    if (matrix === "4321") return "3412";
    return "1234";
  }
  if (op === "ansiedad") {
    return "2143";
  }
  if (op === "limites") {
    if (screen === "DCN") return "2143";
    if (matrix === "4321") return "3412";
    return matrix;
  }
  if (op === "excesos") {
    if (matrix === "3412") return "4321";
    return matrix;
  }
  if (op === "soltar") {
    return "4321";
  }
  return matrix;
}

/** ---------- Strategic Questions (por matriz + operador + idioma) ---------- */
const SQ = {
  en: {
    neutral: {
      "1234": ["What is the next concrete step that costs the least and proves direction?"],
      "3412": ["What’s the real decision you are avoiding naming?"],
      "2143": ["What belief are you protecting that might be the cause?"],
      "4321": ["What would you stop doing if you trusted your direction?"]
    },
    disciplina: {
      "1234": ["Which rule makes the smallest promise you can keep today?"],
      "3412": ["What routine would stabilize this without force?"],
      "2143": ["Which doubt disappears once you define the rule in one sentence?"],
      "4321": ["What do you need to stop feeding so discipline remains clean?"]
    },
    ansiedad: {
      "1234": ["What is one controllable constraint you can accept right now?"],
      "3412": ["What is the smallest stable fact you can stand on?"],
      "2143": ["If the fear is wrong by 10%, what changes?"],
      "4321": ["What would calm your system if you stopped negotiating with the loop?"]
    },
    limites: {
      "1234": ["Which boundary, stated plainly, prevents the most harm?"],
      "3412": ["What are you allowing that you no longer consent to?"],
      "2143": ["What flips if you assume your boundary is valid—without proof?"],
      "4321": ["What must end so a boundary can begin?"]
    },
    excesos: {
      "1234": ["What rule removes the temptation rather than fighting it?"],
      "3412": ["What pattern keeps restarting, and what is the first trigger?"],
      "2143": ["What story justifies the excess—exactly?"],
      "4321": ["What would you cut today if you were protecting your future self?"]
    },
    soltar: {
      "1234": ["What structure can hold the release safely?"],
      "3412": ["What are you gripping that no longer carries signal?"],
      "2143": ["What becomes obvious if you stop needing an explanation?"],
      "4321": ["What are you trying to release, exactly?"]
    }
  },
  es: {
    neutral: {
      "1234": ["¿Cuál es el siguiente paso concreto que cuesta menos y demuestra dirección?"],
      "3412": ["¿Qué decisión real estás evitando nombrar?"],
      "2143": ["¿Qué creencia estás protegiendo que podría ser la causa?"],
      "4321": ["¿Qué dejarías de hacer si confiaras en tu dirección?"]
    },
    disciplina: {
      "1234": ["¿Qué regla hace la promesa más pequeña que sí puedes cumplir hoy?"],
      "3412": ["¿Qué rutina estabiliza esto sin forzar?"],
      "2143": ["¿Qué duda desaparece si defines la norma en una sola frase?"],
      "4321": ["¿Qué debes dejar de alimentar para que la disciplina sea limpia?"]
    },
    ansiedad: {
      "1234": ["¿Qué restricción controlable puedes aceptar ahora mismo?"],
      "3412": ["¿Cuál es el hecho estable más pequeño sobre el que puedes apoyarte?"],
      "2143": ["Si el miedo está equivocado en un 10%, ¿qué cambia?"],
      "4321": ["¿Qué calmaría tu sistema si dejaras de negociar con el bucle?"]
    },
    limites: {
      "1234": ["¿Qué límite, dicho sin rodeos, evita más daño?"],
      "3412": ["¿Qué estás permitiendo sin consentimiento real?"],
      "2143": ["¿Qué cambia si asumes que tu límite es válido—sin pruebas?"],
      "4321": ["¿Qué debe terminar para que un límite empiece?"]
    },
    excesos: {
      "1234": ["¿Qué regla elimina la tentación en vez de pelear con ella?"],
      "3412": ["¿Qué patrón se reinicia y cuál es el primer disparador?"],
      "2143": ["¿Qué historia justifica el exceso—exactamente?"],
      "4321": ["¿Qué cortarías hoy si protegieras a tu yo futuro?"]
    },
    soltar: {
      "1234": ["¿Qué estructura puede sostener el soltar con seguridad?"],
      "3412": ["¿Qué estás agarrando que ya no trae señal?"],
      "2143": ["¿Qué se vuelve obvio si dejas de necesitar explicación?"],
      "4321": ["¿Qué estás intentando soltar exactamente?"]
    }
  },
  ca: {
    neutral: {
      "1234": ["Quin és el següent pas concret que costa menys i demostra direcció?"],
      "3412": ["Quina decisió real estàs evitant anomenar?"],
      "2143": ["Quina creença estàs protegint que podria ser la causa?"],
      "4321": ["Què deixaries de fer si confiessis en la teva direcció?"]
    },
    disciplina: {
      "1234": ["Quina norma fa la promesa més petita que sí pots complir avui?"],
      "3412": ["Quina rutina estabilitza això sense forçar?"],
      "2143": ["Quina dubte desapareix si defineixes la norma en una frase?"],
      "4321": ["Què has de deixar d’alimentar perquè la disciplina sigui neta?"]
    },
    ansiedad: {
      "1234": ["Quina restricció controlable pots acceptar ara mateix?"],
      "3412": ["Quin és el fet estable més petit on et pots sostenir?"],
      "2143": ["Si la por s’equivoca un 10%, què canvia?"],
      "4321": ["Què calmaria el teu sistema si deixessis de negociar amb el bucle?"]
    },
    limites: {
      "1234": ["Quin límit, dit clar, evita més dany?"],
      "3412": ["Què estàs permetent sense consentiment real?"],
      "2143": ["Què canvia si assumes que el teu límit és vàlid—sense proves?"],
      "4321": ["Què ha d’acabar perquè un límit comenci?"]
    },
    excesos: {
      "1234": ["Quina norma elimina la temptació en lloc de lluitar-hi?"],
      "3412": ["Quin patró es reinicia i quin és el primer detonant?"],
      "2143": ["Quina història justifica l’excés—exactament?"],
      "4321": ["Què tallaries avui si protegissis el teu jo futur?"]
    },
    soltar: {
      "1234": ["Quina estructura pot sostenir el deixar anar amb seguretat?"],
      "3412": ["Què estàs agafant que ja no porta senyal?"],
      "2143": ["Què esdevé obvi si deixes de necessitar explicació?"],
      "4321": ["Què estàs intentant deixar anar exactament?"]
    }
  }
};

function strategicQuestion(au, lang, operator) {
  const L = SQ[lang] ? lang : "en";
  const op = SQ[L][operator] ? operator : "neutral";
  const list = SQ[L][op][au.matrix] || SQ[L].neutral["3412"];
  // una sola pregunta (cerrada)
  return list[0];
}

/** ---------- Anti-loop ---------- */
function recentRepeatCount(chain, matrix, window = 4) {
  if (!Array.isArray(chain) || chain.length === 0) return 0;
  const slice = chain.slice(-window);
  let n = 0;
  for (let i = slice.length - 1; i >= 0; i--) {
    if (slice[i]?.matrix === matrix) n += 1;
    else break;
  }
  return n;
}

function antiLoopDecision(prevSession, currentAu) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, currentAu.matrix, 4);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  if (rep >= 3) return "break";

  const last = chain[chain.length - 1];
  if (last?.matrix === "2143" && currentAu.matrix === "2143" && rep >= 2) return "ground";

  return null;
}

function applyAntiToMatrix(matrix, anti, operator) {
  if (!anti) return matrix;

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return operator === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  if (anti === "ground") return "3412";

  return matrix;
}

/** ---------- Espejo (Wancko <-> H-Wancko) ---------- */
function mirrorScoreFromHistorical(signalsDraft, historicalMeta) {
  if (!historicalMeta || typeof historicalMeta !== "object") return null;

  const dH = typeof historicalMeta.dH === "number" ? clamp01(historicalMeta.dH) : null;
  const wH = typeof historicalMeta.wH === "number" ? clamp01(historicalMeta.wH) : null;
  if (dH === null || wH === null) return null;

  // objetivo espejo: Wancko busca aproximarse a (1 - dH, 1 - wH)
  const td = 1 - dH;
  const tw = 1 - wH;

  const d = clamp01(signalsDraft.d);
  const W = clamp01(signalsDraft.W);

  const sd = 1 - Math.min(1, Math.abs(d - td) / 0.55);
  const sw = 1 - Math.min(1, Math.abs(W - tw) / 0.55);

  return clamp01(0.55 * sd + 0.45 * sw);
}

/** ---------- Signals (d/tone/W) con operador + espejo ---------- */
function auSignals(au, prevSession, operator, historicalMeta) {
  // base por matriz
  let d =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.80 :
    0.45;

  if (au.screen === "DCN") d += 0.08;

  // sesgo por operador emergente
  if (operator === "disciplina") d -= 0.06;
  if (operator === "ansiedad") d += 0.06;
  if (operator === "excesos") d += 0.08;
  if (operator === "soltar") d += 0.12;
  if (operator === "limites") d -= 0.02;

  // repetición
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 4);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d += 0.06;
  if (rep >= 2 && au.matrix === "1234") d -= 0.03;

  d = clamp01(d);

  // W (barra reason↔truth) independiente
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.62 :
    au.matrix === "4321" ? 0.78 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (operator === "disciplina") W -= 0.05;
  if (operator === "soltar") W += 0.06;
  if (operator === "ansiedad") W += 0.02;

  W = clamp01(W);

  // borrador para calcular espejo
  let draft = { d, W };

  const mirror = mirrorScoreFromHistorical(draft, historicalMeta);

  // espejo modula (SUAVE, pero visible):
  // si espejo alto -> estabiliza (verde/ámbar), si bajo -> introduce tensión (más rojo) y desplaza d/W
  if (mirror !== null) {
    const pull = (mirror - 0.5); // -0.5..+0.5
    d = clamp01(d - 0.10 * pull); // buen espejo baja tensión (d más “calmo”)
    W = clamp01(W - 0.08 * pull);
  }

  // tono: más agresivo para que se vea
  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  // “continuidad/crepúsculo/ruptura” explícito
  const phase = d < 0.35 ? "continuity" : d < 0.65 ? "dusk" : "rupture";

  return {
    d,
    tone,
    sense: au.sense,
    W,
    phase,
    mirror: mirror === null ? null : Number(mirror.toFixed(2)),
    historical: historicalMeta
      ? {
          archetype: historicalMeta.archetype || null,
          matrix: historicalMeta.matrix || null,
          toneH: historicalMeta.toneH || null
        }
      : null
  };
}

/** ---------- ARPI Cert (intermedio al principio) ---------- */
function arpiCert(nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const hasN1 = last5.some((x) => x?.N === "N1");

  // ✅ arranque en punto intermedio (no vacío)
  if (turns < 2) return { level: "mid" };
  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  return { level: "ok" };
}

/** ---------- Session ---------- */
function nextSession(prev, au, signals, anti, operator) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    last: { ...au, signals, anti, operator },
    chain: [
      ...chain.slice(-19),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        phase: signals.phase,
        operator,
        intent: au.intervention,
        anti: anti || null,
        mirror: signals.mirror
      }
    ]
  };
}

/** ---------- “voz” para que deje de sonar máquina ---------- */
function voiceProfile(lang, operator, au, signals) {
  // 2–3 descriptores max, deterministas y claros
  const bits = [];
  if (operator === "disciplina") bits.push(lang === "es" ? "preciso" : lang === "ca" ? "precís" : "precise");
  if (operator === "ansiedad") bits.push(lang === "es" ? "calmante" : lang === "ca" ? "calmant" : "grounding");
  if (operator === "limites") bits.push(lang === "es" ? "directo" : lang === "ca" ? "directe" : "direct");
  if (operator === "excesos") bits.push(lang === "es" ? "cortante" : lang === "ca" ? "tallant" : "cutting");
  if (operator === "soltar") bits.push(lang === "es" ? "suave" : lang === "ca" ? "suau" : "soft");

  if (!bits.length) bits.push(lang === "es" ? "claro" : lang === "ca" ? "clar" : "clear");

  if (signals?.mirror !== null && typeof signals?.mirror === "number") {
    if (signals.mirror >= 0.70) bits.push(lang === "es" ? "humano" : lang === "ca" ? "humà" : "human");
    if (signals.mirror <= 0.35) bits.push(lang === "es" ? "frío" : lang === "ca" ? "fred" : "cold");
  }

  // matriz también modifica un poco
  if (au.matrix === "2143") bits.push(lang === "es" ? "inversivo" : lang === "ca" ? "inversiu" : "inversive");
  if (au.matrix === "4321") bits.push(lang === "es" ? "desprendido" : lang === "ca" ? "desprès" : "detaching");

  return bits.slice(0, 3).join(", ");
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramentoRaw = body?.juramento || null;

    // espejo desde H-Wancko (si se manda desde page)
    const historicalMeta = body?.historicalMeta || null;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({
        output: null,
        au: null,
        session,
        cert: { level: "mid" }
      });
    }

    const lang = detectLangHeader(req, input);

    // 1) Parse base
    let au = parseAU(input);

    // 2) Operador emergente (si juramento llega, sesga)
    const juramento = normalizeJuramento(juramentoRaw);
    const inferred = inferOperator(input);
    const operator = juramento || inferred;

    // 3) Matriz coherente por operador
    au.matrix = applyOperatorToMatrix(au.matrix, operator, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 4) Anti-loop
    const anti = antiLoopDecision(session, au);
    au.matrix = applyAntiToMatrix(au.matrix, anti, operator);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 5) Signals con espejo
    const signals = auSignals(au, session, operator, historicalMeta);

    // 6) Session + cert
    let newSession = nextSession(session, au, signals, anti, operator);
    const cert = arpiCert(newSession);

    const effectiveSilence = au.intervention === "Silence" || anti === "silence";

    if (effectiveSilence) {
      newSession.silenceCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti, operator },
        session: newSession,
        cert
      });
    }

    // Strategic question local (si pregunta o si anti-break empuja a cierre)
    if (au.intervention === "StrategicQuestion") {
      let q = strategicQuestion(au, lang, operator);
      if (anti === "break") q = q.split("?")[0] + "?";
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti, operator },
        session: newSession,
        cert
      });
    }

    // 7) Answer via OpenAI (texto más “sujeto”)
    const voice = voiceProfile(lang, operator, au, signals);

    const prompt = [
      `MODE: ${au.mode}`,
      `SCREEN: ${au.screen}`,
      `MATRIX: ${au.matrix}`,
      `SENSE: ${au.sense}`,
      `OPERATOR: ${operator}`,
      `GRADIENT_D: ${signals.d.toFixed(2)}`,
      `W: ${signals.W.toFixed(2)}`,
      `PHASE: ${signals.phase}`,
      `MIRROR: ${signals.mirror === null ? "none" : signals.mirror}`,
      historicalMeta?.archetype ? `H_ARCHETYPE: ${historicalMeta.archetype}` : "",
      historicalMeta?.matrix ? `H_MATRIX: ${historicalMeta.matrix}` : "",
      "",
      "VOICE_PROFILE:",
      `- ${voice}`,
      "",
      "RULES:",
      "- No therapy. No advice. No reassurance.",
      "- One closed intervention. No follow-up invitation.",
      "- Max 95 words.",
      `- Output in ${lang} unless the user clearly wrote in another language.`,
      "",
      "USER:",
      String(input)
    ].filter(Boolean).join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are Wancko’s language engine." },
          { role: "user", content: prompt }
        ],
        temperature: 0.45
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti, operator },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break acorta
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti, operator },
      session: newSession,
      cert
    });
  } catch {
    return NextResponse.json({
      output: "—",
      au: null,
      session: null,
      cert: { level: "mid" }
    });
  }
}

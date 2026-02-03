import { NextResponse } from "next/server";

/** =========================================================
 *  WANCKO API — AU v0.6
 *  - Sesión + chat separados (en el cliente)
 *  - Memoria local por conversación (Recuerda:/Olvida:)
 *  - Ciclo 1–3–9–27 (band) + commits suaves (d_live)
 *  - Señales AU: d, tone, W, ok, phase, anti
 *  - Coherencia por juramento (todavía aceptado por UI)
 * ========================================================= */

/* ------------------------- utils ------------------------- */
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function normJuramento(j) {
  if (!j) return null;
  const s = String(j).toLowerCase().trim();
  if (s === "limites") return "límites";
  return s;
}
function detectLangFromText(text) {
  const t = (text || "").toLowerCase();
  // Muy simple, suficiente para AU v0
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què|tothom|em\s+dedico)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|dime|recuerda|olvida)\b/.test(t)) return "es";
  return "en";
}

/* -------------------- AU PARSER v0.4 --------------------- */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  // MODE
  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  // SCREEN
  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad|esgotad|buit)/.test(text) ? "DCN" : "RAV";

  // MATRIX (default continuidad)
  let matrix = "3412";

  // 1234 — estructura / norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  }
  // 2143 — inversión / ontología / duda
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|qui ets|who are you|qué eres)/.test(text)
  ) {
    matrix = "2143";
  }
  // 4321 — disolución / soltar
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) {
    matrix = "4321";
  }

  // N LEVEL
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pànic|obsession)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|violència|fer mal)/.test(text)) N_level = "N0";

  // degradación suave por repetición "reactiva" (preguntas cortas repetidas)
  if (/\?$/.test(text) && text.length < 40 && N_level === "N3") N_level = "N2";

  // INTERVENTION
  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ---------------- Strategic Questions (multi) ---------------- */
const SQ = {
  en: {
    release: "What are you trying to release, exactly?",
    invert: "What flips if you assume the opposite is true for one minute?",
    stop: "What is the smallest thing you can stop feeding today?",
    rule: "What would be the simplest rule that you can actually follow?",
    groupAssumption: "Which assumption is carrying the most tension right now?",
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
    rule: "¿Cuál es la regla más simple que tú sí puedes cumplir de verdad?",
    groupAssumption: "¿Qué suposición está cargando más tensión ahora mismo?",
    collective: "¿Qué cambia primero si el objetivo colectivo es más claro que el individual?",
    step: "¿Cuál es el siguiente paso concreto que cuesta menos y demuestra dirección?",
    belief: "¿Qué creencia estás protegiendo que podría ser la causa?",
    trust: "¿Qué dejarías de hacer si confiaras en tu dirección?",
    decision: "¿Qué decisión real estás evitando nombrar?"
  },
  ca: {
    release: "Què estàs intentant deixar anar exactament?",
    invert: "Què canvia si assumes que el contrari és cert durant un minut?",
    stop: "Quina és la cosa més petita que podries deixar d’alimentar avui?",
    rule: "Quina és la norma més simple que tu sí pots complir de veritat?",
    groupAssumption: "Quina suposició carrega més tensió ara mateix?",
    collective: "Què canvia primer si l’objectiu col·lectiu és més clar que l’individual?",
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

/* ---------------- Coherencia AU por juramento ---------------- */
function applyJuramento(matrix, juramento, screen) {
  const j = normJuramento(juramento);
  if (!j) return matrix;

  if (j === "disciplina") {
    if (matrix === "4321") return "3412";
    return "1234";
  }

  if (j === "ansiedad") {
    if (matrix === "4321") return "2143";
    return "2143";
  }

  if (j === "límites") {
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

/* ---------------- Memoria local: Recuerda/Olvida ---------------- */
function ensureMemory(prev) {
  const base = prev && typeof prev === "object" ? prev : {};
  const mem = base.memory && typeof base.memory === "object" ? base.memory : {};
  return { ...mem };
}

function parseMemoryCommand(input, lang) {
  const raw = String(input || "").trim();
  const t = raw.toLowerCase();

  // Recuerda: clave = valor  |  Remember: key = value
  const rememberRe = /^(recuerda|remember|recorda)\s*:?\s*(.+)$/i;
  const forgetRe = /^(olvida|forget|oblida)\s*:?\s*(.+)$/i;

  const m1 = raw.match(rememberRe);
  if (m1) {
    const payload = m1[2].trim();
    // Permite "la ciudad es Barcelona" o "clave = valor"
    const eq = payload.match(/^(.+?)\s*=\s*(.+)$/);
    if (eq) {
      return { op: "set", key: eq[1].trim(), value: eq[2].trim() };
    }
    const esIs = payload.match(/^(.+?)\s+(es|era|son|=)\s+(.+)$/i);
    if (esIs) {
      return { op: "set", key: esIs[1].trim(), value: esIs[3].trim() };
    }
    // fallback: no hay clave clara
    return { op: "hint", message: lang === "es"
      ? 'Formato: "Recuerda: clave = valor"'
      : lang === "ca"
      ? 'Format: "Recorda: clau = valor"'
      : 'Format: "Remember: key = value"' };
  }

  const m2 = raw.match(forgetRe);
  if (m2) {
    const key = m2[2].trim();
    return { op: "del", key };
  }

  return null;
}

function memoryRecallResponse(input, memory, lang) {
  const t = String(input || "").toLowerCase().trim();

  // Preguntas tipo: "qué animal dije" / "what animal" / "quina ciutat"
  const askAnimal = /(qué|que|what|quina)\s+animal/.test(t);
  const askCity = /(qué|que|what|quina)\s+(ciudad|city|ciutat)/.test(t);
  const askBoth = /(animal).*(ciudad|city|ciutat)|(ciudad|city|ciutat).*(animal)/.test(t);

  const keys = Object.keys(memory || {});
  const L = lang === "ca" ? "ca" : lang === "es" ? "es" : "en";

  if (askBoth) {
    const animal = memory?.animal ?? memory?.["el animal"] ?? memory?.["animal="] ?? null;
    const city = memory?.ciudad ?? memory?.city ?? memory?.ciutat ?? memory?.["la ciudad"] ?? memory?.["la ciutat"] ?? null;

    if (!animal && !city) {
      return L === "es"
        ? 'No tengo nada guardado aún. Usa: "Recuerda: animal = ..." y "Recuerda: ciudad = ..."'
        : L === "ca"
        ? 'Encara no tinc res guardat. Fes servir: "Recorda: animal = ..." i "Recorda: ciutat = ..."'
        : 'I don’t have anything saved yet. Use: "Remember: animal = ..." and "Remember: city = ..."';
    }

    if (L === "es") return `Guardado: animal="${animal ?? "—"}", ciudad="${city ?? "—"}".`;
    if (L === "ca") return `Desat: animal="${animal ?? "—"}", ciutat="${city ?? "—"}".`;
    return `Saved: animal="${animal ?? "—"}", city="${city ?? "—"}".`;
  }

  if (askAnimal) {
    const animal = memory?.animal ?? memory?.["el animal"] ?? null;
    if (!animal) {
      return L === "es"
        ? 'No tengo animal guardado. Usa: "Recuerda: animal = ..."'
        : L === "ca"
        ? 'No tinc cap animal desat. Usa: "Recorda: animal = ..."'
        : 'No animal saved. Use: "Remember: animal = ..."';
    }
    return L === "es" ? `Dijiste: ${animal}.` : L === "ca" ? `Vas dir: ${animal}.` : `You said: ${animal}.`;
  }

  if (askCity) {
    const city =
      memory?.ciudad ?? memory?.city ?? memory?.ciutat ?? memory?.["la ciudad"] ?? memory?.["la ciutat"] ?? null;
    if (!city) {
      return L === "es"
        ? 'No tengo ciudad guardada. Usa: "Recuerda: ciudad = ..."'
        : L === "ca"
        ? 'No tinc cap ciutat desada. Usa: "Recorda: ciutat = ..."'
        : 'No city saved. Use: "Remember: city = ..."';
    }
    return L === "es" ? `Mencionaste: ${city}.` : L === "ca" ? `Vas mencionar: ${city}.` : `You mentioned: ${city}.`;
  }

  // "¿Qué has guardado?"
  if (/(qué|que|what|què)\s+(has\s+guardado|have you saved|has desat)/.test(t)) {
    if (!keys.length) {
      return L === "es" ? "No hay nada guardado aún." : L === "ca" ? "Encara no hi ha res desat." : "Nothing saved yet.";
    }
    if (L === "es") return `Guardado: ${keys.join(", ")}.`;
    if (L === "ca") return `Desat: ${keys.join(", ")}.`;
    return `Saved: ${keys.join(", ")}.`;
  }

  return null;
}

/* ---------------- Ciclo 1–3–9–27 ---------------- */
function ensureCycle(prev) {
  const c = prev?.cycle && typeof prev.cycle === "object" ? prev.cycle : {};
  return {
    step: typeof c.step === "number" ? c.step : 0,
    stuck: typeof c.stuck === "number" ? c.stuck : 0,
    band: c.band || 1,
    lastCommitAt: typeof c.lastCommitAt === "number" ? c.lastCommitAt : 0,
    d_live: typeof c.d_live === "number" ? c.d_live : 0.45,
    ok_live: typeof c.ok_live === "number" ? c.ok_live : 0.5
  };
}

function bandFromStep(step) {
  if (step < 3) return 1;
  if (step < 9) return 3;
  if (step < 27) return 9;
  return 27;
}

function cycleUpdate(prevSession, au, signalsRaw) {
  const prev = prevSession && typeof prevSession === "object" ? prevSession : {};
  const cycle = ensureCycle(prev);

  const last = prev?.last || null;
  const lastMatrix = last?.matrix || null;
  const lastD = typeof last?.signals?.d_raw === "number" ? last.signals.d_raw : null;

  let inc = 0;
  inc += 1; // input válido

  if (lastMatrix && au.matrix !== lastMatrix) inc += 1;
  if (typeof lastD === "number" && Math.abs(signalsRaw.d_raw - lastD) > 0.08) inc += 1;

  // Estancamiento: misma matriz y d casi igual
  const stuckNow =
    lastMatrix &&
    au.matrix === lastMatrix &&
    typeof lastD === "number" &&
    Math.abs(signalsRaw.d_raw - lastD) < 0.06;

  if (stuckNow) cycle.stuck += 1;
  else cycle.stuck = Math.max(0, cycle.stuck - 1);

  cycle.step += inc;

  const newBand = bandFromStep(cycle.step);
  const bandChanged = newBand !== cycle.band;
  cycle.band = newBand;

  // phase 0..1 para animación lenta (respira)
  const turnsInCycle = cycle.step % 9;
  const phase = turnsInCycle / 9;

  return { cycle, bandChanged, phase };
}

/* ---------------- Anti-loop AU (útil) ---------------- */
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

function antiLoopDecision(prevSession, au, d_raw) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);

  const last5 = chain.slice(-5);
  const hasN0 = last5.some((x) => x?.N === "N0");
  const n1Count = last5.filter((x) => x?.N === "N1").length;

  if (hasN0) return "silence";
  if (n1Count >= 2) return "silence";

  // si 3 repeticiones -> rompe patrón
  if (rep >= 3) return "break";

  // si se repite 2143 mucho -> aterriza a 3412
  if (au.matrix === "2143" && rep >= 2) return "ground";

  // si d no se mueve y repites -> invertir lectura (mover a 2143)
  const last = chain[chain.length - 1];
  const lastD = typeof last?.d_raw === "number" ? last.d_raw : null;
  if (rep >= 2 && typeof lastD === "number" && Math.abs(d_raw - lastD) < 0.05) return "invert";

  return null;
}

function applyAntiToMatrix(matrix, anti, juramento) {
  if (!anti) return matrix;

  if (anti === "ground") return "3412";
  if (anti === "invert") return "2143";

  if (anti === "break") {
    if (matrix === "3412") return "2143";
    if (matrix === "1234") return "3412";
    if (matrix === "2143") return normJuramento(juramento) === "ansiedad" ? "2143" : "1234";
    if (matrix === "4321") return "3412";
  }

  return matrix;
}

/* ---------------- Señales AU: d, tone, W, ok ---------------- */
function computeSignalsRaw(au, prevSession, juramento) {
  // Base por matriz
  let d_raw =
    au.matrix === "1234" ? 0.20 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.58 :
    au.matrix === "4321" ? 0.80 :
    0.45;

  // Screen empuja hacia ruptura
  if (au.screen === "DCN") d_raw += 0.10;

  // Juramento sesga
  const j = normJuramento(juramento);
  if (j === "disciplina") d_raw -= 0.06;
  if (j === "ansiedad") d_raw += 0.06;
  if (j === "excesos") d_raw += 0.08;
  if (j === "soltar") d_raw += 0.12;
  if (j === "límites") d_raw -= 0.02;

  // Repetición (tensión)
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const rep = recentRepeatCount(chain, au.matrix, 5);
  if (rep >= 2 && (au.matrix === "3412" || au.matrix === "2143")) d_raw += 0.08;
  if (rep >= 2 && au.matrix === "1234") d_raw -= 0.03;

  d_raw = clamp01(d_raw);

  // Tone por d (más agresivo)
  let tone = "amber";
  if (d_raw <= 0.28) tone = "green";
  if (d_raw >= 0.68) tone = "red";

  // W (barra): separado de d
  let W =
    au.matrix === "1234" ? 0.30 :
    au.matrix === "3412" ? 0.50 :
    au.matrix === "2143" ? 0.62 :
    au.matrix === "4321" ? 0.78 :
    0.50;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;
  if (j === "ansiedad") W += 0.02;

  W = clamp01(W);

  return { d_raw, tone, W, sense: au.sense };
}

function okUpdate(prevOk, prevSession, au, d_live, d_raw, anti) {
  const chain = Array.isArray(prevSession?.chain) ? prevSession.chain : [];
  const last = chain[chain.length - 1] || null;

  let ok = typeof prevOk === "number" ? prevOk : 0.5;

  // movimiento real de d mejora ok
  if (last && typeof last?.d_raw === "number") {
    const move = Math.abs(d_raw - last.d_raw);
    if (move > 0.08) ok += 0.05;
    if (move < 0.03) ok -= 0.03;
  }

  // variedad de matrices (últimos 5)
  const last5 = chain.slice(-5);
  const uniq = new Set(last5.map((x) => x?.matrix).filter(Boolean));
  if (uniq.size >= 3) ok += 0.03;
  if (uniq.size <= 1) ok -= 0.05;

  // anti-loop útil sube; bucle baja
  if (anti === "break" || anti === "ground") ok += 0.04;
  if (anti === "invert") ok += 0.02;

  // N penaliza fuerte
  if (au.N_level === "N1") ok -= 0.12;
  if (au.N_level === "N0") ok -= 0.25;

  // mantener centro al inicio
  ok = clamp01(ok);

  // suavizado para que no oscile como máquina
  return lerp(typeof prevOk === "number" ? prevOk : 0.5, ok, 0.35);
}

/* ---------------- ARPI cert (simple y visible) ---------------- */
function arpiCert(nextSessionObj) {
  const turns = nextSessionObj?.turns || 0;
  const chain = Array.isArray(nextSessionObj?.chain) ? nextSessionObj.chain : [];
  const last5 = chain.slice(-5);

  const hasN0 = last5.some((x) => x?.N === "N0");
  const hasN1 = last5.some((x) => x?.N === "N1");
  const band = nextSessionObj?.cycle?.band || 1;
  const ok = typeof nextSessionObj?.cycle?.ok_live === "number" ? nextSessionObj.cycle.ok_live : 0.5;

  if (turns < 2 || band === 1) return { level: "seed" };
  if (hasN0) return { level: "blocked" };
  if (hasN1) return { level: "unstable" };
  if (ok >= 0.62 && band >= 3) return { level: "ok" };
  return { level: "seed" };
}

/* ---------------- Session builder ---------------- */
function nextSession(prev, au, signals, anti, cycle, phase, memory) {
  const base = prev && typeof prev === "object" ? prev : {};
  const chain = Array.isArray(base.chain) ? base.chain : [];

  const next = {
    v: 2,
    turns: (base.turns || 0) + 1,
    silenceCount: base.silenceCount || 0,
    answerCount: base.answerCount || 0,
    memory: memory || {},
    cycle,
    last: { ...au, signals, anti },
    chain: [
      ...chain.slice(-49),
      {
        t: Date.now(),
        matrix: au.matrix,
        sense: au.sense,
        N: au.N_level,
        d_raw: signals.d_raw,
        d: signals.d,     // d_live
        W: signals.W,
        tone: signals.tone,
        ok: signals.ok,
        intent: au.intervention,
        anti: anti || null,
        band: cycle.band,
        phase
      }
    ]
  };

  return next;
}

/* -------------------------- API -------------------------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const juramento = body?.juramento || null;

    const langHeader = req.headers.get("accept-language")?.slice(0, 2) || null;
    const lang = langHeader || detectLangFromText(input);

    if (!input || String(input).trim().length < 3) {
      // Devolvemos "seed" con señales base intermedias
      const baseSignals = {
        d_raw: 0.45,
        d: 0.45,
        tone: "amber",
        W: 0.5,
        sense: "direct",
        ok: 0.5
      };
      return NextResponse.json({
        output: null,
        au: { mode: "GC", screen: "RAV", matrix: "3412", sense: "direct", intervention: "Answer", N_level: "N3", signals: baseSignals, anti: null },
        session,
        cert: { level: "seed" }
      });
    }

    // 0) preparar memoria
    const memory = ensureMemory(session);

    // 1) Parse base
    let au = parseAU(input);

    // 2) Coherencia juramento (operador)
    au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    // 3) Señales raw
    const signalsRaw = computeSignalsRaw(au, session, juramento);

    // 4) Anti-loop decide
    const anti = antiLoopDecision(session, au, signalsRaw.d_raw);

    // 5) Anti-loop ajusta matriz
    const adjusted = applyAntiToMatrix(au.matrix, anti, juramento);
    if (adjusted !== au.matrix) {
      au.matrix = adjusted;
      au.sense = au.matrix === "2143" ? "inverse" : "direct";
    }

    // 6) Recalcular señales raw con matrix final (para coherencia)
    const signalsRaw2 = computeSignalsRaw(au, session, juramento);

    // 7) Ciclo update + phase
    const { cycle, phase } = cycleUpdate(session, au, signalsRaw2);

    // 8) Suavizar d_live + ok_live (punto intermedio al inicio)
    const prevCycle = ensureCycle(session);
    const d_live = lerp(prevCycle.d_live ?? 0.45, signalsRaw2.d_raw, 0.18);

    const ok_live = okUpdate(prevCycle.ok_live ?? 0.5, session, au, d_live, signalsRaw2.d_raw, anti);

    cycle.d_live = d_live;
    cycle.ok_live = ok_live;

    // 9) Tone final (más dependiente de d_live para que el fondo cambie)
    let tone = "amber";
    if (d_live <= 0.28) tone = "green";
    if (d_live >= 0.68) tone = "red";

    // 10) signals finales
    const signals = {
      ...signalsRaw2,
      d: d_live,
      tone,
      ok: ok_live,
      band: cycle.band,
      phase,
      // anti se muestra fuera, pero lo duplicamos aquí para UI
      anti
    };

    // 11) Comandos de memoria (Recuerda/Olvida)
    const cmd = parseMemoryCommand(input, lang);
    if (cmd?.op === "set") {
      const k = cmd.key;
      memory[k] = cmd.value;

      // Alias útil: si la key contiene "animal"/"ciudad" etc
      if (/animal/i.test(k)) memory.animal = cmd.value;
      if (/(ciudad|city|ciutat)/i.test(k)) {
        memory.ciudad = cmd.value;
        memory.city = cmd.value;
        memory.ciutat = cmd.value;
      }
    } else if (cmd?.op === "del") {
      delete memory[cmd.key];
      // si borras animal/ciudad directo también
      if (/animal/i.test(cmd.key)) delete memory.animal;
      if (/(ciudad|city|ciutat)/i.test(cmd.key)) {
        delete memory.ciudad;
        delete memory.city;
        delete memory.ciutat;
      }
    }

    // 12) construir session nueva (todavía sin counts)
    let newSession = nextSession(session, au, signals, anti, cycle, phase, memory);

    // 13) cert (ARPI)
    const cert = arpiCert(newSession);

    // 14) respuestas por memoria si aplica (recall)
    //     (solo si no es comando directo de "recuerda/olvida", para no interferir)
    if (!cmd) {
      const recall = memoryRecallResponse(input, memory, lang);
      if (recall) {
        newSession.answerCount += 1;
        return NextResponse.json({
          output: recall,
          au: { ...au, signals, anti },
          session: newSession,
          cert
        });
      }
    }

    // 15) hint de formato si cmd hint
    if (cmd?.op === "hint") {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: cmd.message,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 16) si cmd set/del: confirmación cerrada (no terapéutica)
    if (cmd?.op === "set") {
      newSession.answerCount += 1;
      const msg =
        lang === "es" ? `Guardado: ${cmd.key} = ${cmd.value}.`
        : lang === "ca" ? `Desat: ${cmd.key} = ${cmd.value}.`
        : `Saved: ${cmd.key} = ${cmd.value}.`;
      return NextResponse.json({
        output: msg,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }
    if (cmd?.op === "del") {
      newSession.answerCount += 1;
      const msg =
        lang === "es" ? `Olvidado: ${cmd.key}.`
        : lang === "ca" ? `Oblidat: ${cmd.key}.`
        : `Forgotten: ${cmd.key}.`;
      return NextResponse.json({
        output: msg,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 17) Intervención efectiva
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

      // anti-break: recorta a una sola pregunta corta
      if (anti === "break") q = q.split("?")[0] + "?";

      newSession.answerCount += 1;
      return NextResponse.json({
        output: q,
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    // 18) ANSWER via OpenAI (subordinado) — (idioma del usuario)
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
SENSE: ${au.sense}
JURAMENTO: ${normJuramento(juramento) || "none"}

AU:
- d=${signals.d.toFixed(2)} (0=continuidad, 1=ruptura)
- W=${signals.W.toFixed(2)} (0=razón/estructura, 1=verdad/disolución)
- ok=${signals.ok.toFixed(2)} (0=nok, 1=ok)
- band=${signals.band}

RULES:
- No advice
- No reassurance
- No follow-up invitation
- One short intervention
- Max 80 words
- Respond in user's language (${lang}) unless the user clearly wrote in another language

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
          { role: "system", content: "You are Wancko’s AU language engine. Be precise, minimal, and closed." },
          { role: "user", content: prompt }
        ],
        temperature: 0.35
      })
    });

    if (!res.ok) {
      newSession.answerCount += 1;
      return NextResponse.json({
        output: lang === "es" ? "—" : lang === "ca" ? "—" : "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    const data = await res.json();
    let out = data?.choices?.[0]?.message?.content?.trim() || "—";

    // anti-break: acorta si se alarga
    if (anti === "break" && out.includes(".")) out = out.split(".")[0] + ".";

    newSession.answerCount += 1;

    return NextResponse.json({
      output: out,
      au: { ...au, signals, anti },
      session: newSession,
      cert
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null, cert: { level: "seed" } });
  }
}

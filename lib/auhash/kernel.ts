/* ============================================================
 * AU_HASH KERNEL (abstracto) — v1
 * - Funciones puras:
 *   extractGlyphs(text, lang)
 *   updateAUHash(prev, glyphs, role)
 *   resolveQuery(text)
 *   retrieve(state, query)
 *
 * Objetivo práctico:
 * - Memoria NO depende de "playa/montaña" hardcoded.
 * - Guarda por GLIFOS (tokens normalizados + hash)
 * - Recupera por compatibilidad (query ↔ memoria), no literalidad.
 * - Evita cambio de idioma aleatorio: el kernel devuelve sugerencia, la route decide.
 * ============================================================ */

export type Lang = "es" | "ca" | "en";
export type Role = "user" | "assistant";

export type Domain =
  | "FACT"
  | "PLACE"
  | "CHOICE"
  | "IDENTITY"
  | "WHAT_WAS_SAID"
  | "UNKNOWN";

export type Glyph = {
  id: string;          // hash estable
  kind: "token" | "entity" | "place" | "fact" | "intent" | "emotion";
  key: string;         // forma normalizada (no literal)
  value?: string;      // valor original (si procede)
  w: number;           // peso (0..1)
  t: number;           // timestamp
  lang: Lang;
  role: Role;
};

export type AUHashState = {
  v: 1;
  t0: number;               // primer timestamp
  tLast: number;            // último timestamp
  lang: Lang;               // idioma fijado por sesión (lo decide route)
  // “memoria” como mapa de glifos con acumulación:
  store: Record<string, { glyph: Glyph; score: number; seen: number; last: number }>;
  // trazas ligeras:
  lastUserText?: string;
  lastAssistantText?: string;
  // señales emergentes (no deterministas fuertes, solo “features”):
  features: {
    entropy: number;        // complejidad algorítmica (cantidad/variedad)
    beauty: number;         // belleza estructural (coherencia/compresión)
    tension: number;        // tensión (repetición / contradicción leve)
  };
};

export type RetrieveResult = {
  domain: Domain;
  hit?: {
    glyph: Glyph;
    confidence: number;     // 0..1
    render: string;         // cómo devolverlo (texto)
  };
  // cuando no hay hit útil, proponemos “qué falta”
  missing?: string;
};

/* --------------------------- util --------------------------- */

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function nowTs() {
  return Date.now();
}

// hash simple estable (sin crypto para no depender runtime)
export function hashAU(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  // 8 hex
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

function norm(text: string) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^\p{L}\p{N}\s=:_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLangHeuristic(text: string): Lang {
  const t = (text || "").toLowerCase();
  // catalán: punt volat, diacrítics, patrons freqüents
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(per que|per què|avui|aixo|això|mho|em|saps|quina|quin)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(que|qué|por que|por qué|hoy|donde|recuerda|sabes|cu[aá]l)\b/.test(t)) return "es";
  return "en";
}

/* ------------------ extracción (glifos) ------------------ */

/**
 * extractGlyphs:
 * - Saca tokens relevantes, entidades simples, lugares (sin hardcode de ejemplos)
 * - Detecta patrones: "X = Y", "la ciudad es X", "voy a X", "ir a X"
 * - No depende del dominio concreto, solo de estructura.
 */
export function extractGlyphs(textRaw: string, langIn?: Lang): { langGuess: Lang; glyphs: Glyph[] } {
  const t = textRaw || "";
  const langGuess = langIn || detectLangHeuristic(t);
  const tNorm = norm(t);
  const ts = nowTs();

  const glyphs: Glyph[] = [];

  // 1) hechos explícitos tipo "clave = valor" o "recuerda: clave = valor"
  // (no hardcodeamos claves, solo extraemos)
  const assign = tNorm.match(/\b([a-z0-9_-]{2,32})\s*=\s*([a-z0-9 _-]{2,64})\b/);
  if (assign) {
    const key = assign[1];
    const val = assign[2].trim();
    const id = hashAU(`fact:${key}:${val}`);
    glyphs.push({
      id,
      kind: "fact",
      key,
      value: val,
      w: 0.95,
      t: ts,
      lang: langGuess,
      role: "user"
    });
  }

  // 2) patrones semánticos de “lugar” (sin lista de playas, montañas, etc.)
  // Ej: "voy a X", "ire a X", "anire a X", "ir al X", "a X" (con limitación)
  const placeMatch =
    tNorm.match(/\b(voy a|ire a|ir a|anire a|anar a|go to)\s+([a-z0-9 _-]{2,48})\b/) ||
    tNorm.match(/\b(en|a|al|al\s+|a la|a l)\s+([a-z0-9 _-]{2,48})\b/);

  if (placeMatch) {
    const candidate = (placeMatch[2] || placeMatch[1] || "").trim();
    // filtro: no guardar determinantes sueltos
    if (candidate.length >= 3 && !/^(el|la|los|les|the|un|una|uns|unes)$/.test(candidate)) {
      const key = `place:${candidate}`;
      const id = hashAU(key);
      glyphs.push({
        id,
        kind: "place",
        key: candidate,
        value: candidate,
        w: 0.55,
        t: ts,
        lang: langGuess,
        role: "user"
      });
    }
  }

  // 3) tokens “interesantes”: sustantivos/proposiciones (aprox) por longitud y frecuencia
  // NO es NLP. Solo heurística para “recordar algo”.
  const words = tNorm.split(" ").filter(Boolean);
  const stop = new Set([
    "yo","tu","el","la","los","las","un","una","unos","unas","de","del","a","al","en","y","o","que","qué","por","para","con","sin","es","son",
    "me","te","se","mi","mis","su","sus","lo","le","les","this","that","the","a","an","to","of","in","and","or","is","are",
    "avui","aixo","això","per","pero","perque","perquè","com","quina","quin","on","donde","dónde","where"
  ]);

  const freq: Record<string, number> = {};
  for (const w of words) {
    if (w.length < 4) continue;
    if (stop.has(w)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [w, f] of sorted) {
    const id = hashAU(`tok:${w}`);
    glyphs.push({
      id,
      kind: "token",
      key: w,
      value: w,
      w: clamp01(0.20 + 0.08 * f),
      t: ts,
      lang: langGuess,
      role: "user"
    });
  }

  // 4) emoción (muy simple) para perfilar sin categorías sensibles
  if (/\b(agotad|cansad|vac[i]o|burnout|tired|empty)\b/.test(tNorm)) {
    const id = hashAU("emo:low");
    glyphs.push({ id, kind: "emotion", key: "low", w: 0.7, t: ts, lang: langGuess, role: "user" });
  }
  if (/\b(content|feliz|happy|calm|tranquil)\b/.test(tNorm)) {
    const id = hashAU("emo:up");
    glyphs.push({ id, kind: "emotion", key: "up", w: 0.55, t: ts, lang: langGuess, role: "user" });
  }

  return { langGuess, glyphs };
}

/* ------------------ actualizar estado AU_HASH ------------------ */

export function updateAUHash(prev: AUHashState | null, glyphs: Glyph[], role: Role): AUHashState {
  const ts = nowTs();
  const base: AUHashState = prev && prev.v === 1
    ? prev
    : {
        v: 1,
        t0: ts,
        tLast: ts,
        lang: "es",
        store: {},
        features: { entropy: 0.15, beauty: 0.15, tension: 0.10 }
      };

  const store = { ...base.store };

  // entropía: variedad de glifos nuevos vs repetidos
  let newCount = 0;
  let repCount = 0;

  for (const g0 of glyphs) {
    const g: Glyph = { ...g0, role };
    const cur = store[g.id];

    if (!cur) {
      newCount += 1;
      store[g.id] = { glyph: g, score: g.w, seen: 1, last: g.t };
    } else {
      repCount += 1;
      const bump = 0.35 * g.w;          // refuerzo suave (no infinito)
      const decay = 0.92;               // decaimiento del score anterior
      store[g.id] = {
        glyph: g, // reemplaza con la versión más reciente (t y value actual)
        score: clamp01(cur.score * decay + bump),
        seen: cur.seen + 1,
        last: g.t
      };
    }
  }

  // tensión: repetición alta + pocas novedades
  const tension = clamp01(base.features.tension * 0.92 + (repCount >= 3 && newCount === 0 ? 0.10 : 0.02));

  // entropía: sube con novedades, baja con repetición pura
  const entropy = clamp01(base.features.entropy * 0.90 + clamp01(0.06 * newCount - 0.02 * repCount + 0.02));

  // belleza: compresión/coherencia: sube si repites pero con estructura (facts) o refuerzas pocos núcleos
  const hasFacts = glyphs.some(g => g.kind === "fact");
  const beauty = clamp01(base.features.beauty * 0.92 + (hasFacts ? 0.06 : 0.02) + (repCount >= 2 && newCount <= 1 ? 0.03 : 0));

  return {
    ...base,
    tLast: ts,
    store,
    features: { entropy, beauty, tension },
    ...(role === "user" ? { lastUserText: (glyphs[0]?.value ? String(glyphs[0].value) : base.lastUserText) } : {}),
  };
}

/* ------------------ resolver consulta / recuperar ------------------ */

export function resolveQuery(textRaw: string): Domain {
  const t = norm(textRaw);

  // “qué dije / he dicho / said” → WHAT_WAS_SAID
  if (/\b(que|qué|quin|which|what)\b.*\b(dije|he dit|said|mentioned|mencion)\b/.test(t)) return "WHAT_WAS_SAID";

  // “dónde / on / where” → PLACE
  if (/\b(donde|dónde|on|where)\b/.test(t)) return "PLACE";

  // “quál / which one / entre” → CHOICE
  if (/\b(entre|between|quina|quin|which one)\b/.test(t)) return "CHOICE";

  // “quién eres / qui ets / who are you” → IDENTITY
  if (/\b(quien eres|qui ets|who are you)\b/.test(t)) return "IDENTITY";

  // hechos “animal/ciudad/etc” sin hardcode: lo tratamos como FACT si pregunta por “dato guardado”
  if (/\b(recuerdas|recordes|remember)\b/.test(t)) return "FACT";

  return "UNKNOWN";
}

function bestMatchFromStore(state: AUHashState, kind: Glyph["kind"], lang: Lang): { glyph: Glyph; confidence: number } | null {
  const entries = Object.values(state.store);
  // puntuación: score * recencia
  let best: { glyph: Glyph; confidence: number } | null = null;

  for (const e of entries) {
    if (e.glyph.kind !== kind) continue;
    // preferimos el idioma de sesión, pero permitimos cross
    const langBonus = e.glyph.lang === lang ? 1.0 : 0.92;
    const ageSec = Math.max(1, (state.tLast - e.last) / 1000);
    const recency = clamp01(1.0 / Math.log(2 + ageSec)); // decae suave
    const conf = clamp01(e.score * 0.75 + recency * 0.35) * langBonus;

    if (!best || conf > best.confidence) best = { glyph: e.glyph, confidence: conf };
  }

  return best;
}

export function retrieve(state: AUHashState, textRaw: string): RetrieveResult {
  const domain = resolveQuery(textRaw);
  const L = state.lang;

  // Si no hay memoria suficiente
  const memSize = Object.keys(state.store).length;
  if (memSize === 0) {
    return {
      domain,
      missing: L === "ca" ? "No hi ha prou rastre encara." : L === "en" ? "Not enough trace yet." : "Aún no hay suficiente rastro."
    };
  }

  // PLACE: devolvemos el “place” más fuerte
  if (domain === "PLACE") {
    const hit = bestMatchFromStore(state, "place", L);
    if (!hit || hit.confidence < 0.33) {
      return {
        domain,
        missing: L === "ca"
          ? "Em falta el lloc en forma fixada."
          : L === "en"
          ? "I’m missing the place in a fixed form."
          : "Me falta el lugar en forma fijada."
      };
    }
    return {
      domain,
      hit: {
        glyph: hit.glyph,
        confidence: hit.confidence,
        render: hit.glyph.value || hit.glyph.key
      }
    };
  }

  // WHAT_WAS_SAID: devolvemos el “token” o “fact” más fuerte
  if (domain === "WHAT_WAS_SAID") {
    const fact = bestMatchFromStore(state, "fact", L);
    const tok = bestMatchFromStore(state, "token", L);
    const pick = fact && (!tok || fact.confidence >= tok.confidence) ? fact : tok;

    if (!pick || pick.confidence < 0.30) {
      return {
        domain,
        missing: L === "ca"
          ? "Puc recuperar un nucli, però aquí no n’hi ha cap de prou estable."
          : L === "en"
          ? "I can retrieve a nucleus, but none is stable enough yet."
          : "Puedo recuperar un núcleo, pero aún no hay ninguno suficientemente estable."
      };
    }

    // render de fact: "clave = valor"
    if (pick.glyph.kind === "fact") {
      return {
        domain,
        hit: {
          glyph: pick.glyph,
          confidence: pick.confidence,
          render: `${pick.glyph.key} = ${pick.glyph.value}`
        }
      };
    }

    return {
      domain,
      hit: { glyph: pick.glyph, confidence: pick.confidence, render: pick.glyph.value || pick.glyph.key }
    };
  }

  // FACT: devolvemos fact más fuerte
  if (domain === "FACT") {
    const hit = bestMatchFromStore(state, "fact", L);
    if (!hit || hit.confidence < 0.35) {
      return {
        domain,
        missing: L === "ca"
          ? "Puc fixar fets si hi ha una assignació clara (clau = valor)."
          : L === "en"
          ? "I can fix facts if there is a clear assignment (key = value)."
          : "Puedo fijar hechos si hay una asignación clara (clave = valor)."
      };
    }
    return { domain, hit: { glyph: hit.glyph, confidence: hit.confidence, render: `${hit.glyph.key} = ${hit.glyph.value}` } };
  }

  // CHOICE / UNKNOWN: no devolvemos “cerrado”, solo pedimos la pieza faltante
  return {
    domain,
    missing:
      L === "ca"
        ? "Quina peça falta perquè això sigui decidible, aquí i ara?"
        : L === "en"
        ? "What piece is missing for this to become decidable, here and now?"
        : "¿Qué pieza falta para que esto sea decidible, aquí y ahora?"
  };
}

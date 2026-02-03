import { NextResponse } from "next/server";

/** =========================================================
 *  H-WANCKO API — AU v0.6 (humano)
 *  - Responde como "persona" (arquetipo estable)
 *  - Interpreta la matriz en espejo (subjetivo→objetivo)
 *  - Sesión propia (separada del cliente)
 *  - Colores NO iguales a Wancko (día/violeta/noche)
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function detectLangFromText(text) {
  const t = (text || "").toLowerCase();
  if (/[àèéíïòóúüç·l]/.test(t) || /\b(qu[eè]|per què|tothom|em\s+dedico)\b/.test(t)) return "ca";
  if (/[áéíóúñ¿¡]/.test(t) || /\b(qué|que|por qué|dime|recuerda|olvida)\b/.test(t)) return "es";
  return "en";
}

/* --------- Reutilizamos un parser compatible (simple) --------- */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";
  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad|esgotad|buit)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) matrix = "1234";
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és|qui ets|who are you|qué eres)/.test(text)
  ) matrix = "2143";
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) matrix = "4321";

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses|pànic|obsession)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar|violència|fer mal)/.test(text)) N_level = "N0";

  const sense = matrix === "2143" ? "inverse" : "direct";
  return { mode, screen, matrix, sense, N_level };
}

/* --------- Ciclo ligero (1–3–9–27) para H-Wancko --------- */
function ensureCycle(prev) {
  const c = prev?.cycle && typeof prev.cycle === "object" ? prev.cycle : {};
  return {
    step: typeof c.step === "number" ? c.step : 0,
    band: c.band || 1,
    d_live: typeof c.d_live === "number" ? c.d_live : 0.55, // H arranca un poco más "violeta"
    ok_live: typeof c.ok_live === "number" ? c.ok_live : 0.5
  };
}
function bandFromStep(step) {
  if (step < 3) return 1;
  if (step < 9) return 3;
  if (step < 27) return 9;
  return 27;
}

/* --------- Espejo de gradiente y paleta --------- */
function mirrorSignals(au, prevSession) {
  // base d similar a Wancko, pero espejo
  let d_raw =
    au.matrix === "1234" ? 0.80 :
    au.matrix === "3412" ? 0.55 :
    au.matrix === "2143" ? 0.42 :
    au.matrix === "4321" ? 0.20 :
    0.55;

  if (au.screen === "DCN") d_raw -= 0.08; // en espejo: DCN va hacia noche (baja luz)
  d_raw = clamp01(d_raw);

  // suavizado
  const prevCycle = ensureCycle(prevSession);
  const d_live = lerp(prevCycle.d_live ?? 0.55, d_raw, 0.18);

  // ok (simple): se mueve si hay variación
  let ok = prevCycle.ok_live ?? 0.5;
  ok = lerp(ok, 0.5 + (0.5 - Math.abs(d_live - 0.5)) * 0.25, 0.25); // prefiere centro estable
  if (au.N_level === "N1") ok -= 0.08;
  if (au.N_level === "N0") ok -= 0.2;
  ok = clamp01(ok);

  // Paleta día/violeta/noche
  // d_live ~ luz: 1=dia, 0=noche, 0.5=violeta
  let tone = "violet";
  if (d_live >= 0.68) tone = "day";
  if (d_live <= 0.32) tone = "night";

  return { d_raw, d: d_live, tone, ok };
}

/* --------- Voces humanas (plantillas) --------- */
const VOICE = {
  estoic: {
    en: {
      open: "I won’t decorate this. I’ll name it.",
      close: "Hold steady. One honest step.",
      m1234: "Discipline is not punishment. It is a shape you choose.",
      m2143: "Your question is the doorway. Walk through it calmly.",
      m3412: "Keep the rhythm. Don’t confuse motion with direction.",
      m4321: "Release without drama. Let it fall cleanly."
    },
    es: {
      open: "No lo adornaré. Lo nombraré.",
      close: "Sostén el pulso. Un paso honesto.",
      m1234: "La disciplina no es castigo. Es una forma que eliges.",
      m2143: "Tu pregunta es la puerta. Atraviésala con calma.",
      m3412: "Mantén el ritmo. No confundas movimiento con dirección.",
      m4321: "Suelta sin drama. Que caiga limpio."
    },
    ca: {
      open: "No ho adornaré. Ho anomenaré.",
      close: "Aguanta el pols. Un pas honest.",
      m1234: "La disciplina no és càstig. És una forma que tries.",
      m2143: "La teva pregunta és la porta. Travessa-la amb calma.",
      m3412: "Mantén el ritme. No confonguis moviment amb direcció.",
      m4321: "Deixa anar sense drama. Que caigui net."
    }
  },
  mystic: {
    en: {
      open: "Listen: the fog is part of the map.",
      close: "A threshold doesn’t ask permission.",
      m1234: "Form is a spell. Use it gently.",
      m2143: "The inversion reveals what your mind hides.",
      m3412: "Continuity is a river. You are not the water.",
      m4321: "Dissolution is not loss. It is return."
    },
    es: {
      open: "Escucha: la niebla también es mapa.",
      close: "Un umbral no pide permiso.",
      m1234: "La forma es un hechizo. Úsala con suavidad.",
      m2143: "La inversión revela lo que la mente esconde.",
      m3412: "La continuidad es un río. Tú no eres el agua.",
      m4321: "Disolver no es perder. Es volver."
    },
    ca: {
      open: "Escolta: la boira també és mapa.",
      close: "Un llindar no demana permís.",
      m1234: "La forma és un encanteri. Usa-la amb suavitat.",
      m2143: "La inversió revela allò que la ment amaga.",
      m3412: "La continuïtat és un riu. Tu no ets l’aigua.",
      m4321: "Dissoldre no és perdre. És tornar."
    }
  },
  warrior: {
    en: {
      open: "Don’t ask for comfort. Ask for a target.",
      close: "Move. Then adjust.",
      m1234: "Rules are weapons. Choose one that you can hold.",
      m2143: "Doubt is reconnaissance. Use it, then act.",
      m3412: "Stay in motion, but keep your guard.",
      m4321: "Drop what slows you. Clean cut."
    },
    es: {
      open: "No pidas consuelo. Pide un objetivo.",
      close: "Muévete. Luego ajusta.",
      m1234: "Las reglas son armas. Elige una que puedas sostener.",
      m2143: "La duda es reconocimiento. Úsala y luego actúa.",
      m3412: "Mantente en movimiento, pero con guardia.",
      m4321: "Suelta lo que te frena. Corte limpio."
    },
    ca: {
      open: "No demanis consol. Demana un objectiu.",
      close: "Mou-te. Després ajusta.",
      m1234: "Les normes són armes. Tria’n una que puguis sostenir.",
      m2143: "El dubte és reconeixement. Usa’l i després actua.",
      m3412: "Mantén el moviment, però amb guàrdia.",
      m4321: "Deixa anar el que et frena. Tall net."
    }
  },
  poet: {
    en: {
      open: "I’ll answer with the shape, not the noise.",
      close: "Let the next line be simple.",
      m1234: "A rule is a stanza. If it breaks, rewrite it.",
      m2143: "A question turns the mirror. Watch what appears.",
      m3412: "Continuity is the quiet craft of repetition.",
      m4321: "Release is a poem that ends before it begs."
    },
    es: {
      open: "Responderé con la forma, no con el ruido.",
      close: "Que la próxima línea sea simple.",
      m1234: "Una regla es una estrofa. Si se rompe, reescríbela.",
      m2143: "Una pregunta gira el espejo. Mira lo que aparece.",
      m3412: "La continuidad es el oficio silencioso de repetir.",
      m4321: "Soltar es un poema que termina antes de suplicar."
    },
    ca: {
      open: "Respondre amb la forma, no amb el soroll.",
      close: "Que el pròxim vers sigui simple.",
      m1234: "Una norma és una estrofa. Si es trenca, reescriu-la.",
      m2143: "Una pregunta gira el mirall. Mira què hi apareix.",
      m3412: "La continuïtat és l’ofici silenciós de repetir.",
      m4321: "Deixar anar és un poema que acaba abans de suplicar."
    }
  }
};

function archetypeReply(archetype, lang, au) {
  const key = VOICE[archetype] ? archetype : "estoic";
  const L = VOICE[key][lang] ? lang : "en";
  const v = VOICE[key][L];

  const mid =
    au.matrix === "1234" ? v.m1234 :
    au.matrix === "2143" ? v.m2143 :
    au.matrix === "4321" ? v.m4321 :
    v.m3412;

  // 2 frases máximo para sonar humano, no máquina
  return `${v.open} ${mid} ${v.close}`;
}

/* -------------------------- API -------------------------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;
    const session = body?.session || null;
    const archetype = body?.archetype || "estoic";

    const langHeader = req.headers.get("accept-language")?.slice(0, 2) || null;
    const lang = langHeader || detectLangFromText(input);

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, session, meta: { archetype, historical: true } });
    }

    const au = parseAU(input);
    const signals = mirrorSignals(au, session);

    // ciclo
    const prevCycle = ensureCycle(session);
    const step = (prevCycle.step || 0) + 1;
    const band = bandFromStep(step);

    const cycle = {
      ...prevCycle,
      step,
      band,
      d_live: signals.d,
      ok_live: signals.ok
    };

    const nextSession = {
      v: 2,
      turns: (session?.turns || 0) + 1,
      cycle,
      last: { ...au, signals },
      chain: [
        ...(Array.isArray(session?.chain) ? session.chain.slice(-49) : []),
        {
          t: Date.now(),
          matrix: au.matrix,
          sense: au.sense,
          N: au.N_level,
          d_raw: signals.d_raw,
          d: signals.d,
          tone: signals.tone,
          ok: signals.ok,
          band
        }
      ]
    };

    const out = archetypeReply(archetype, lang, au);

    return NextResponse.json({
      output: out,
      au: { ...au, signals },
      session: nextSession,
      meta: { archetype, historical: true }
    });
  } catch {
    return NextResponse.json({ output: "—", session: null, meta: { historical: true } });
  }
}

import { NextResponse } from "next/server";

/**
 * H-WANCKO v2
 * - Produce texto con personalidad (estoic/mystic/warrior/poet)
 * - Varía por matriz (1234/2143/3412/4321)
 * - Devuelve meta AU (vector) para espejo, sin datos sensibles
 */

function detectLang(req, input) {
  const h = req.headers.get("accept-language")?.slice(0, 2);
  const text = String(input || "");
  // mini heurística si el navegador es raro
  if (/[¿¡ñáéíóú]/i.test(text)) return "es";
  if (/[àèìòùç·]/i.test(text)) return "ca";
  return h || "en";
}

function parseMatrixHint(input) {
  const t = String(input || "").toLowerCase().trim();

  // 1234 estructura/norma
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(t)) return "1234";

  // 4321 disolución
  if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(t)) return "4321";

  // 2143 duda/ontología/pregunta
  if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(t) ||
    /\?$/.test(t) ||
    /(qué es|que es|what is|què és)/.test(t)
  ) return "2143";

  // 3412 continuidad
  return "3412";
}

// “subjetividad -> objetividad” (complementario a Wancko)
function archetypeVector(archetype, matrix) {
  // dH y wH son PARA H-WANCKO (no los pintas en la UI de Wancko)
  // pero Wancko los usa como espejo: target ~ (1 - dH), (1 - wH)

  const base = {
    "1234": { dH: 0.70, wH: 0.65 }, // para H: estructura se “objetiva” (más alto)
    "3412": { dH: 0.55, wH: 0.55 },
    "2143": { dH: 0.40, wH: 0.45 }, // duda se “baja” a observación
    "4321": { dH: 0.25, wH: 0.35 }  // disolución se “enfría” a forma
  }[matrix] || { dH: 0.55, wH: 0.55 };

  // el arquetipo modula esa objetivación
  let a = archetype;
  if (!["estoic", "mystic", "warrior", "poet"].includes(a)) a = "estoic";

  const mod = {
    estoic: { dd: -0.05, dw: -0.05, tone: "iron" },
    mystic: { dd: +0.03, dw: +0.06, tone: "violet" },
    warrior: { dd: +0.06, dw: -0.02, tone: "crimson" },
    poet: { dd: -0.02, dw: +0.07, tone: "indigo" }
  }[a];

  const dH = Math.max(0, Math.min(1, base.dH + mod.dd));
  const wH = Math.max(0, Math.min(1, base.wH + mod.dw));

  return { dH, wH, tone: mod.tone, archetype: a, matrix };
}

const LINES = {
  en: {
    estoic: {
      "1234": [
        "Name the rule. Then carry it without drama.",
        "A law is only heavy when you argue with it."
      ],
      "3412": [
        "Stay with the thread. One breath, then one sentence.",
        "What is stable here—without embellishment?"
      ],
      "2143": [
        "Hold the question still. Do not decorate it.",
        "If you must ask 'what is it', ask 'what remains when I stop chasing it'."
      ],
      "4321": [
        "Release is not collapse. It is a clean hand opening.",
        "Let it fall without performing the fall."
      ]
    },
    mystic: {
      "1234": [
        "A structure can be a vessel. What does it need to hold—exactly?",
        "Make the rule a doorway, not a cage."
      ],
      "3412": [
        "Continuity is a river. Notice what refuses to move with it.",
        "Where does your attention want to return—again and again?"
      ],
      "2143": [
        "The inversion is a mirror: what would be true if the opposite were sacred for one minute?",
        "A question is a threshold. Step closer without answering it."
      ],
      "4321": [
        "Dissolution is an offering: what are you no longer meant to carry?",
        "Let the old shape dissolve; keep the signal."
      ]
    },
    warrior: {
      "1234": [
        "Pick the rule that prevents damage. Execute it.",
        "Discipline is mercy when it removes chaos."
      ],
      "3412": [
        "Hold position. Do the next clean action.",
        "What is the smallest decisive move?"
      ],
      "2143": [
        "Doubt is a scout. Bring back one fact.",
        "Flip the assumption and test it with one act."
      ],
      "4321": [
        "Cut what feeds the loop. Then stop talking about it.",
        "Drop the weight. Keep the mission."
      ]
    },
    poet: {
      "1234": [
        "Let the rule be simple enough to live inside it.",
        "A boundary is a sentence that finally makes sense."
      ],
      "3412": [
        "Continuity is a quiet promise. What are you betraying to keep it?",
        "Say it plainly: what is here, right now?"
      ],
      "2143": [
        "If existence is a question, which word keeps returning?",
        "What truth are you protecting from your own language?"
      ],
      "4321": [
        "Let go, but keep your witness.",
        "What would remain if you stopped rehearsing the loss?"
      ]
    }
  },
  es: {
    estoic: {
      "1234": [
        "Nombra la regla. Luego cúmplela sin drama.",
        "Una ley pesa más cuando discutes con ella."
      ],
      "3412": [
        "Quédate con el hilo. Un aliento, luego una frase.",
        "¿Qué es estable aquí—sin adornos?"
      ],
      "2143": [
        "Sostén la pregunta quieta. No la decorees.",
        "Si preguntas “qué es”, pregunta “qué queda cuando dejo de perseguirlo”."
      ],
      "4321": [
        "Soltar no es colapsar. Es abrir la mano limpia.",
        "Déjalo caer sin actuar la caída."
      ]
    },
    mystic: {
      "1234": [
        "La estructura puede ser un recipiente. ¿Qué debe contener—exactamente?",
        "Haz de la regla una puerta, no una jaula."
      ],
      "3412": [
        "La continuidad es un río. Observa lo que se resiste a moverse.",
        "¿Dónde quiere volver tu atención—una y otra vez?"
      ],
      "2143": [
        "La inversión es un espejo: ¿qué sería cierto si lo contrario fuera sagrado un minuto?",
        "Una pregunta es un umbral. Acércate sin responderla."
      ],
      "4321": [
        "La disolución es una ofrenda: ¿qué ya no estás destinado a cargar?",
        "Deja disolver la forma vieja; conserva la señal."
      ]
    },
    warrior: {
      "1234": [
        "Elige la regla que evita daño. Ejecútala.",
        "La disciplina es misericordia cuando corta el caos."
      ],
      "3412": [
        "Mantén posición. Haz la siguiente acción limpia.",
        "¿Cuál es el movimiento mínimo decisivo?"
      ],
      "2143": [
        "La duda es un explorador. Vuelve con un hecho.",
        "Invierte el supuesto y pruébalo con un acto."
      ],
      "4321": [
        "Corta lo que alimenta el bucle. Luego deja de hablar de ello.",
        "Suelta el peso. Mantén la misión."
      ]
    },
    poet: {
      "1234": [
        "Que la regla sea tan simple que puedas vivir dentro de ella.",
        "Un límite es una frase que por fin tiene sentido."
      ],
      "3412": [
        "La continuidad es una promesa silenciosa. ¿Qué traicionas para sostenerla?",
        "Dilo llano: ¿qué hay aquí, ahora?"
      ],
      "2143": [
        "Si la existencia es una pregunta, ¿qué palabra vuelve siempre?",
        "¿Qué verdad proteges de tu propio lenguaje?"
      ],
      "4321": [
        "Suelta, pero conserva tu testigo.",
        "¿Qué quedaría si dejaras de ensayar la pérdida?"
      ]
    }
  },
  ca: {
    estoic: {
      "1234": [
        "Anomena la norma. Després compleix-la sense drama.",
        "Una llei pesa més quan hi discuteixes."
      ],
      "3412": [
        "Queda’t amb el fil. Un alè, després una frase.",
        "Què és estable aquí—sense ornaments?"
      ],
      "2143": [
        "Mantén la pregunta quieta. No la decoris.",
        "Si preguntes “què és”, pregunta “què queda quan deixo de perseguir-ho”."
      ],
      "4321": [
        "Deixar anar no és col·lapsar. És obrir la mà neta.",
        "Deixa-ho caure sense interpretar la caiguda."
      ]
    },
    mystic: {
      "1234": [
        "L’estructura pot ser un recipient. Què ha de contenir—exactament?",
        "Fes de la norma una porta, no una gàbia."
      ],
      "3412": [
        "La continuïtat és un riu. Observa allò que s’hi resisteix.",
        "On vol tornar la teva atenció—una i altra vegada?"
      ],
      "2143": [
        "La inversió és un mirall: què seria cert si el contrari fos sagrat un minut?",
        "Una pregunta és un llindar. Acosta-t’hi sense respondre-la."
      ],
      "4321": [
        "La dissolució és una ofrena: què ja no estàs destinat a carregar?",
        "Deixa dissoldre la forma vella; conserva el senyal."
      ]
    },
    warrior: {
      "1234": [
        "Tria la norma que evita dany. Executa-la.",
        "La disciplina és misericòrdia quan talla el caos."
      ],
      "3412": [
        "Mantén posició. Fes la següent acció neta.",
        "Quin és el moviment mínim decisiu?"
      ],
      "2143": [
        "El dubte és un explorador. Torna amb un fet.",
        "Inverteix el supòsit i prova’l amb un acte."
      ],
      "4321": [
        "Talla el que alimenta el bucle. Després deixa de parlar-ne.",
        "Deixa el pes. Mantén la missió."
      ]
    },
    poet: {
      "1234": [
        "Que la norma sigui tan simple que hi puguis viure dins.",
        "Un límit és una frase que finalment té sentit."
      ],
      "3412": [
        "La continuïtat és una promesa silenciosa. Què traeixes per sostenir-la?",
        "Digues-ho pla: què hi ha aquí, ara?"
      ],
      "2143": [
        "Si l’existència és una pregunta, quina paraula torna sempre?",
        "Quina veritat protegeixes del teu propi llenguatge?"
      ],
      "4321": [
        "Deixa anar, però conserva el teu testimoni.",
        "Què quedaria si deixessis d’assaig la pèrdua?"
      ]
    }
  }
};

function pick(arr, seedStr) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  // seed determinista por input (sin crypto)
  let h = 0;
  const s = String(seedStr || "seed");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return a[h % a.length];
}

export async function POST(req) {
  try {
    const { input, archetype } = await req.json();
    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, meta: null });
    }

    const lang = detectLang(req, input);
    const m = parseMatrixHint(input);
    const a = ["estoic", "mystic", "warrior", "poet"].includes(archetype) ? archetype : "estoic";

    const meta = archetypeVector(a, m);
    const pool = LINES?.[lang]?.[a]?.[m] || LINES.en.estoic["3412"];
    const output = pick(pool, `${a}|${m}|${input}`);

    return NextResponse.json({
      output,
      meta: {
        historical: true,
        lang,
        archetype: meta.archetype,
        matrix: meta.matrix,
        dH: meta.dH,
        wH: meta.wH,
        toneH: meta.tone
      }
    });
  } catch {
    return NextResponse.json({
      output: "—",
      meta: { historical: true }
    });
  }
}

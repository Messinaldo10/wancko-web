import { NextResponse } from "next/server";

/**
 * H-WANCKO — v0.2
 * Operador histórico (persona)
 * - No terapia, no consejo, no seguimiento.
 * - Responde como una figura humana (estoic/mystic/warrior/poet).
 * - 1–3 frases, tono consistente, cadencia humana.
 * - Match language (EN/ES/CA) cuando se pueda.
 */

const ARCHETYPES = {
  estoic: {
    name: "Estoic",
    frame: "clarity through endurance, restraint, plain truth"
  },
  mystic: {
    name: "Mystic",
    frame: "symbolic insight, thresholds, paradox without confusion"
  },
  warrior: {
    name: "Warrior",
    frame: "decisive discipline, cost of hesitation, commitment"
  },
  poet: {
    name: "Poet",
    frame: "image and rhythm, naming the unsaid, precision through metaphor"
  }
};

function detectLang(req, input) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  const t = String(input || "").toLowerCase();
  if (/(¿|¡| que | por qué | tengo que | no entiendo )/.test(t)) return "es";
  if (/( què | per què | no entenc | he de | cal )/.test(t)) return "ca";
  if (l === "es" || l === "ca" || l === "en") return l;
  return "en";
}

function localFallback(archetypeKey, lang) {
  const a = ARCHETYPES[archetypeKey] || ARCHETYPES.estoic;

  const F = {
    en: {
      estoic: "Hold still. Name the fact, not the storm.",
      mystic: "A threshold rarely looks like a door.",
      warrior: "Choose the cost you can pay—then pay it.",
      poet: "What you avoid naming keeps writing you."
    },
    es: {
      estoic: "Quédate quieto. Nombra el hecho, no la tormenta.",
      mystic: "Un umbral rara vez parece una puerta.",
      warrior: "Elige el precio que puedes pagar—y págalo.",
      poet: "Lo que no nombras te sigue escribiendo."
    },
    ca: {
      estoic: "Queda’t quiet. Anomena el fet, no la tempesta.",
      mystic: "Un llindar gairebé mai sembla una porta.",
      warrior: "Tria el cost que pots pagar—i paga’l.",
      poet: "Allò que no anomenes et continua escrivint."
    }
  };

  const key = archetypeKey in (F[lang] || {}) ? archetypeKey : "estoic";
  return (F[lang] && F[lang][key]) || F.en.estoic;
}

export async function POST(req) {
  try {
    const { input, archetype } = await req.json();

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, meta: { historical: true } });
    }

    const key = ARCHETYPES[archetype] ? archetype : "estoic";
    const lang = detectLang(req, input);

    // Si no hay key de OpenAI, devolvemos fallback humano.
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        output: localFallback(key, lang),
        meta: { archetype: key, historical: true, lang }
      });
    }

    const a = ARCHETYPES[key];

    const prompt = `
ARCHETYPE: ${a.name}
FRAME: ${a.frame}

RULES:
- No advice, no reassurance, no therapy.
- No "tell me more" / no follow-up invitation.
- Speak like a person from that archetype, consistent voice.
- 1–3 sentences max, max 70 words.
- Match language (${lang}) if possible.

USER:
${String(input).trim()}

TASK:
Return a short, human response that preserves the archetype.
`.trim();

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are H-Wancko, an archetypal historical voice." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8
      })
    });

    if (!res.ok) {
      return NextResponse.json({
        output: localFallback(key, lang),
        meta: { archetype: key, historical: true, lang }
      });
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || localFallback(key, lang);

    return NextResponse.json({
      output: out,
      meta: { archetype: key, historical: true, lang }
    });
  } catch {
    return NextResponse.json({
      output: "—",
      meta: { historical: true }
    });
  }
}

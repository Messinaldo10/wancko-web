import { NextResponse } from "next/server";

/**
 * H-WANCKO — AU v0.3 (humano por arquetipo)
 * - Voz consistente por figura (estoic/mystic/warrior/poet)
 * - Lectura complementaria "subjetividad → objetividad"
 * - No terapia. No consejo. No seguimiento.
 * - Respuesta corta (1–2 frases), pero con carácter.
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function normLang(h) {
  const s = (h || "").toLowerCase();
  if (s.startsWith("es")) return "es";
  if (s.startsWith("ca")) return "ca";
  return "en";
}

// Mapeo espejo: Wancko (objetivo→subjetivo), H (subjetivo→objetivo)
// Inversión perceptiva: cada matriz se lee como su “complemento operativo”
const MIRROR_MATRIX = {
  "1234": "4321",
  "3412": "2143",
  "2143": "3412",
  "4321": "1234"
};

function inferMatrixFromText(input) {
  const t = String(input || "").toLowerCase().trim();
  let m = "3412";
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de|hay que)/.test(t)) m = "1234";
  else if (/\?$/.test(t) || /(qué es|que es|what is|què és|por qué|why)/.test(t)) m = "2143";
  else if (/(soltar|dejar|basta|prou|stop|let go|release)/.test(t)) m = "4321";
  return m;
}

function hSignals(mirrorMatrix) {
  // H-pantalla: OK centrado al inicio, deriva por “matriz espejo”
  let d =
    mirrorMatrix === "1234" ? 0.22 :
    mirrorMatrix === "3412" ? 0.46 :
    mirrorMatrix === "2143" ? 0.62 :
    mirrorMatrix === "4321" ? 0.80 :
    0.50;

  d = clamp01(d);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.70) tone = "red";

  // barra H: “subjetivo↔objetivo” (invertida respecto a Wancko)
  let W =
    mirrorMatrix === "1234" ? 0.78 :
    mirrorMatrix === "3412" ? 0.62 :
    mirrorMatrix === "2143" ? 0.45 :
    mirrorMatrix === "4321" ? 0.28 :
    0.5;

  W = clamp01(W);

  return { d, tone, W };
}

const ARCHETYPES = {
  estoic: {
    name: "estoic",
    system:
      "You are an Stoic elder. You speak with calm, discipline, clarity. 1–2 short sentences. No advice, no reassurance, no therapy. Sound human and grounded."
  },
  mystic: {
    name: "mystic",
    system:
      "You are a mystic elder. You speak with symbolic precision, thresholds, fog, revelation. 1–2 short sentences. No advice, no reassurance, no therapy. Sound human and uncanny but clear."
  },
  warrior: {
    name: "warrior",
    system:
      "You are a warrior elder. You speak with directness, cost, courage, action. 1–2 short sentences. No advice, no reassurance, no therapy. Sound human and sharp."
  },
  poet: {
    name: "poet",
    system:
      "You are a poet elder. You speak with clean imagery and emotional accuracy. 1–2 short sentences. No advice, no reassurance, no therapy. Sound human."
  }
};

export async function POST(req) {
  try {
    const { input, archetype } = await req.json();
    if (!input || String(input).trim().length < 3) {
      const base = { matrix: "3412", mirror: "2143" };
      return NextResponse.json({
        output: null,
        meta: { archetype: "estoic", historical: true, ...base },
        signals: hSignals(base.mirror)
      });
    }

    const lang = normLang(req.headers.get("accept-language"));
    const key = ARCHETYPES[archetype] ? archetype : "estoic";

    const m = inferMatrixFromText(input);
    const mirror = MIRROR_MATRIX[m] || "2143";
    const signals = hSignals(mirror);

    // Si no hay API key, degradamos a respuestas no-fijas pero deterministas
    if (!process.env.OPENAI_API_KEY) {
      const local =
        key === "warrior"
          ? (lang === "es" ? "Nombrarlo ya es un acto: ahora mide el coste de seguir igual." : "Naming it is already an act: now measure the cost of staying the same.")
          : key === "mystic"
          ? (lang === "es" ? "Antes del umbral, todo parece niebla: observa qué parte de ti se resiste a ver." : "Before the threshold, everything is fog: notice what part of you resists seeing.")
          : key === "poet"
          ? (lang === "es" ? "Hay una frase que evita salir: ahí vive el centro de esto." : "There’s a sentence that refuses to emerge: that’s where the center lives.")
          : (lang === "es" ? "Quédate con el hecho desnudo: sin adorno, sin huida." : "Stay with the bare fact: no ornament, no escape.");

      return NextResponse.json({
        output: local,
        meta: { archetype: key, historical: true, matrix: m, mirror },
        signals
      });
    }

    const prompt =
`LANG: ${lang}
USER_MATRIX: ${m}
MIRROR_MATRIX: ${mirror}

RULES:
- 1–2 short sentences.
- No advice, no reassurance, no therapy.
- Maintain archetype identity strongly.
- Speak human, not like a machine.

USER:
${input}

TASK:
Reply in the archetype voice. Let the MIRROR_MATRIX shape how you interpret the user.
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
          { role: "system", content: ARCHETYPES[key].system },
          { role: "user", content: prompt }
        ],
        temperature: 0.65
      })
    });

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || (lang === "es" ? "Silencio." : "Silence.");

    return NextResponse.json({
      output: out,
      meta: { archetype: key, historical: true, matrix: m, mirror },
      signals
    });
  } catch {
    return NextResponse.json({
      output: "Silence was also an answer in my time.",
      meta: { archetype: "estoic", historical: true, matrix: "3412", mirror: "2143" },
      signals: { d: 0.5, tone: "amber", W: 0.5 }
    });
  }
}

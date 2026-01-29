import { NextResponse } from "next/server";

/* =========================================================
   WANCKO API — AU v0.6
   - Mantiene TODA la complejidad previa
   - Añade VOZ AU real (subjetividad perceptible)
   - Wancko vs H-Wancko se sienten distintos
   ========================================================= */

/* ===================== VOZ AU ===================== */
/*
La voz NO es estilo: es posición subjetiva.
Se deriva de:
- matriz
- modo (wancko / historical)
- juramento (bias)
*/
function resolveVoice({ matrix, mode, juramento, screen }) {
  const j = juramento ? String(juramento).toLowerCase() : "";

  if (mode === "historical") {
    if (matrix === "1234") return "lawgiver";
    if (matrix === "2143") return "philosopher";
    if (matrix === "4321") return "mystic";
    return "chronicler"; // 3412
  }

  // Wancko (interno, acompañante)
  if (matrix === "1234") return j === "disciplina" ? "coach" : "guide";
  if (matrix === "2143") return j === "ansiedad" ? "anxious_mirror" : "mirror";
  if (matrix === "4321") return j === "soltar" ? "void" : "release";
  return "witness"; // 3412
}

/* ===================== PROMPTS POR VOZ ===================== */
function voicePrompt(voice, lang) {
  const L = lang.startsWith("es") ? "es" : lang.startsWith("ca") ? "ca" : "en";

  const P = {
    en: {
      guide: "Speak clearly and concretely. One idea. Grounded.",
      coach: "Directive but humane. Short sentences. Focus on discipline.",
      witness: "Describe what is happening without judging or advising.",
      mirror: "Question assumptions gently. Reflect the contradiction.",
      anxious_mirror:
        "Acknowledge tension without reinforcing it. Slow, grounding.",
      release:
        "Suggest letting go without instruction. Few words.",
      void:
        "Minimal, poetic. Silence is part of the answer.",

      lawgiver:
        "Speak as a principle or law. Impersonal. Firm.",
      philosopher:
        "Explore meaning and paradox. Abstract but precise.",
      mystic:
        "Symbolic, metaphorical, very few words.",
      chronicler:
        "Narrate the unfolding process calmly."
    },
    es: {
      guide: "Habla claro y concreto. Una sola idea.",
      coach:
        "Directivo pero humano. Frases cortas. Enfocado en disciplina.",
      witness:
        "Describe lo que ocurre sin juzgar ni aconsejar.",
      mirror:
        "Cuestiona los supuestos con suavidad.",
      anxious_mirror:
        "Reconoce la tensión sin amplificarla. Ritmo lento.",
      release:
        "Sugiere soltar sin instruir. Pocas palabras.",
      void:
        "Lenguaje mínimo y poético. El silencio también responde.",

      lawgiver:
        "Habla como una norma o principio. Impersonal y firme.",
      philosopher:
        "Explora significado y paradoja. Preciso.",
      mystic:
        "Simbólico, evocador, muy breve.",
      chronicler:
        "Narra el proceso que se despliega."
    }
  };

  return P[L][voice] || P[L].witness;
}

/* ===================== AU PARSER (base) ===================== */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que)/.test(text))
    matrix = "1234";
  else if (
    /(why|por qué|qué es|what is|\?$)/.test(text)
  )
    matrix = "2143";
  else if (/(let go|soltar|basta|parar)/.test(text))
    matrix = "4321";

  let N_level = "N3";
  if (/(ansiedad|panic|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence)/.test(text)) N_level = "N0";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  return {
    mode,
    screen,
    matrix,
    sense: matrix === "2143" ? "inverse" : "direct",
    intervention,
    N_level
  };
}

/* ===================== GRADIENTE AU ===================== */
function auSignals(au, prevSession, juramento) {
  let d =
    au.matrix === "1234" ? 0.2 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.6 :
    au.matrix === "4321" ? 0.82 :
    0.45;

  if (au.screen === "DCN") d += 0.08;

  const j = juramento ? String(juramento).toLowerCase() : "";
  if (j === "disciplina") d -= 0.05;
  if (j === "ansiedad") d += 0.06;
  if (j === "excesos") d += 0.08;
  if (j === "soltar") d += 0.12;

  d = Math.max(0, Math.min(1, d));

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.7) tone = "red";

  let W =
    au.matrix === "1234" ? 0.3 :
    au.matrix === "3412" ? 0.5 :
    au.matrix === "2143" ? 0.65 :
    au.matrix === "4321" ? 0.8 :
    0.5;

  if (au.screen === "DCN") W += 0.05;
  if (j === "disciplina") W -= 0.05;
  if (j === "soltar") W += 0.06;

  W = Math.max(0, Math.min(1, W));

  return { d, tone, W, sense: au.sense };
}

/* ===================== API ===================== */
export async function POST(req) {
  try {
    const body = await req.json();
    const { input, session, juramento, mode = "wancko" } = body;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: "—", au: null, session });
    }

    const lang = req.headers.get("accept-language")?.slice(0, 2) || "en";

    // 1) AU base
    let au = parseAU(input);

    // 2) Señales AU
    const signals = auSignals(au, session, juramento);

    // 3) Resolver VOZ
    const voice = resolveVoice({
      matrix: au.matrix,
      mode,
      juramento,
      screen: au.screen
    });

    // 4) Silencio
    if (au.intervention === "Silence") {
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, voice },
        session
      });
    }

    // 5) Prompt con VOZ AU
    const prompt = `
VOICE:
${voicePrompt(voice, lang)}

STATE:
- MATRIX: ${au.matrix}
- SCREEN: ${au.screen}
- JURAMENTO: ${juramento || "none"}

RULES:
- One short intervention
- Max 80 words
- Do NOT explain AU
- Do NOT reassure

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
          { role: "system", content: "You are Wancko." },
          { role: "user", content: prompt }
        ],
        temperature: mode === "historical" ? 0.6 : 0.35
      })
    });

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

    return NextResponse.json({
      output: out,
      au: { ...au, signals, voice },
      session
    });
  } catch {
    return NextResponse.json({ output: "—", au: null, session: null });
  }
}

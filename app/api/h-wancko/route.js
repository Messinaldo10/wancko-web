import { NextResponse } from "next/server";

/** =========================================================
 *  H-WANCKO — AU v0.4 (arquetipos reales + espejo complementario)
 *  - No terapia. No consejo. No seguimiento.
 *  - Respuesta como "persona-arquetipo" (no plantilla fija)
 *  - Gradiente propio: luz → violeta → noche
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function norm(s) {
  return String(s || "").toLowerCase().trim();
}

function detectLang(req) {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return l === "es" || l === "ca" || l === "en" ? l : "en";
}

/** ---------- AU parse simple (para espejo) ---------- */
function parseAU(input) {
  const text = norm(input);

  let matrix = "3412";
  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) matrix = "1234";
  else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) matrix = "2143";
  else if (/(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)) matrix = "4321";

  const screen = /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";
  const sense = matrix === "2143" ? "inverse" : "direct";

  // N solo para color (no para silencio aquí)
  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  return { matrix, screen, sense, N_level };
}

/** ---------- espejo complementario ----------
 * Wancko: objetividad AU → subjetividad AU
 * H-Wancko: subjetividad AU → objetividad AU
 * => mapeo complementario suave (no inverso duro)
 */
function mirrorMatrix(matrix) {
  // Complemento (no literal):
  // 1234 ↔ 2143 (estructura ↔ inversión)
  // 3412 ↔ 4321 (continuidad ↔ disolución)
  if (matrix === "1234") return "2143";
  if (matrix === "2143") return "1234";
  if (matrix === "3412") return "4321";
  if (matrix === "4321") return "3412";
  return "3412";
}

/** ---------- gradiente H ----------
 * dH: 0 luz / 0.5 violeta / 1 noche
 */
function hSignals(au, archetype) {
  // Base por matriz espejo
  let d =
    au.matrix === "1234" ? 0.55 :
    au.matrix === "2143" ? 0.25 :
    au.matrix === "3412" ? 0.70 :
    au.matrix === "4321" ? 0.45 :
    0.50;

  // DCN empuja a noche
  if (au.screen === "DCN") d += 0.10;

  // Arquetipo sesga (subjetividad estable)
  const a = norm(archetype);
  if (a === "estoic") d -= 0.06;   // más luz/claridad
  if (a === "mystic") d += 0.02;   // más violeta/umbral
  if (a === "warrior") d += 0.06;  // más noche/decisión dura
  if (a === "poet") d += 0.00;     // centrado en violeta

  d = clamp01(d);

  // Tone H: day / twilight / night
  let tone = "twilight";
  if (d <= 0.30) tone = "day";
  if (d >= 0.70) tone = "night";

  // Bar H (W_H): “claridad ↔ misterio”
  let W =
    au.matrix === "1234" ? 0.60 :
    au.matrix === "2143" ? 0.35 :
    au.matrix === "3412" ? 0.70 :
    au.matrix === "4321" ? 0.50 :
    0.55;

  if (au.screen === "DCN") W += 0.06;
  W = clamp01(W);

  return { d, tone, W };
}

/** ---------- estilo por arquetipo (persona real) ---------- */
function archetypeSystem(archetype, lang) {
  const a = norm(archetype);

  const baseRules =
`RULES:
- No advice. No therapy. No reassurance.
- No “tell me more”. No follow-up invitation.
- Speak as a person-archetype with stable identity.
- 1 short passage, max 90 words.
- Keep it vivid, not generic.`;

  if (a === "estoic") {
    return `You are an ancient Stoic voice. You speak with restraint, clarity, and discipline. ${baseRules} Language: ${lang}`;
  }
  if (a === "mystic") {
    return `You are a mystical voice at the threshold. You speak in images, but precise. ${baseRules} Language: ${lang}`;
  }
  if (a === "warrior") {
    return `You are a warrior voice. Direct, decisive, consequences-first. ${baseRules} Language: ${lang}`;
  }
  if (a === "poet") {
    return `You are a poet voice. Lyrical but sharp; you reveal structure through metaphor. ${baseRules} Language: ${lang}`;
  }
  return `You are an ancient Stoic voice. ${baseRules} Language: ${lang}`;
}

export async function POST(req) {
  try {
    const { input, archetype } = await req.json();
    const lang = detectLang(req);

    if (!input || String(input).trim().length < 2) {
      return NextResponse.json({ output: null, meta: null });
    }

    // AU espejo
    const au0 = parseAU(input);
    const mirrored = mirrorMatrix(au0.matrix);
    const au = { ...au0, matrix: mirrored, sense: mirrored === "2143" ? "inverse" : "direct" };

    const signals = hSignals(au, archetype);

    // OpenAI para que sea “persona”, no plantilla
    const sys = archetypeSystem(archetype, lang);

    const prompt =
`MATRIX: ${au.matrix}
SCREEN: ${au.screen}
SENSE: ${au.sense}
H_GRADIENT_D: ${signals.d.toFixed(2)}
H_TONE: ${signals.tone}
H_BAR_W: ${signals.W.toFixed(2)}

USER:
${String(input).trim()}

TASK:
Return ONE short archetypal passage that preserves the archetype identity.
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
          { role: "system", content: sys },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      // fallback humano mínimo
      const fallback =
        lang === "es"
          ? "No daré consejo. Te devuelvo forma: mira dónde tu frase quiere volverse verdad."
          : lang === "ca"
          ? "No donaré consell. Et retorno forma: mira on la frase vol fer-se veritat."
          : "No advice. I return form: notice where your sentence tries to become true.";

      return NextResponse.json({
        output: fallback,
        meta: { archetype: archetype || "estoic", historical: true, au, signals }
      });
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

    return NextResponse.json({
      output: out,
      meta: { archetype: archetype || "estoic", historical: true, au, signals }
    });
  } catch {
    return NextResponse.json({
      output: "—",
      meta: null
    });
  }
}

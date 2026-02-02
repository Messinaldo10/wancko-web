import { NextResponse } from "next/server";

/** =========================================================
 *  H-WANCKO API — AU v0.2
 *  - Mantiene SUJETO (estoic/mystic/warrior/poet)
 *  - Lectura espejo: subjetividad -> objetividad (complementaria)
 *  - Señales propias (hSignals): d/W/tone independientes
 *  - Respuesta humana (cadencia y rasgo estable), no “frase fija”
 * ========================================================= */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function pickLang(req, bodyLang) {
  const h = req.headers.get("accept-language") || "";
  const fromHeader = h.slice(0, 2).toLowerCase();
  const fromBody = (bodyLang || "").slice(0, 2).toLowerCase();
  const lang = fromBody || fromHeader || "en";
  if (["es", "ca", "en"].includes(lang)) return lang;
  return "en";
}

/** ---------- matriz espejo (complementaria) ---------- */
function mirrorMatrixFromWancko(wMatrix) {
  // Complemento: lo que estabiliza en Wancko, se refleja como “prueba” en H
  // 1234 <-> 4321 y 3412 <-> 2143 (pares espejo)
  if (wMatrix === "1234") return "4321";
  if (wMatrix === "4321") return "1234";
  if (wMatrix === "3412") return "2143";
  if (wMatrix === "2143") return "3412";
  return "2143";
}

/** ---------- señales H (complementarias) ---------- */
function hSignalsFromMirror(wSignals, archetype) {
  const wd = typeof wSignals?.d === "number" ? wSignals.d : 0.5;
  const wW = typeof wSignals?.W === "number" ? wSignals.W : 0.5;

  // Complementario + micro-desplazamiento por sujeto (para que se note)
  let d = clamp01(1 - wd);
  let W = clamp01(1 - wW);

  const a = String(archetype || "estoic").toLowerCase();
  if (a === "estoic") { d -= 0.04; W -= 0.03; }
  if (a === "mystic") { d += 0.05; W += 0.05; }
  if (a === "warrior") { d -= 0.01; W -= 0.06; }
  if (a === "poet") { d += 0.03; W += 0.02; }

  d = clamp01(d);
  W = clamp01(W);

  let tone = "amber";
  if (d <= 0.28) tone = "green";
  if (d >= 0.68) tone = "red";

  return { d, W, tone };
}

/** ---------- sujeto estable (system prompt) ---------- */
function archetypeSystem(archetype, lang) {
  const a = String(archetype || "estoic").toLowerCase();
  const L = lang;

  const base = {
    en: `You are H-Wancko: a historical operator. You are NOT therapy. You give no advice, no reassurance, no follow-up questions. You speak like a person with a stable character. 45–120 words.`,
    es: `Eres H-Wancko: operador histórico. NO eres terapia. No das consejos, no tranquilizas, no haces preguntas de seguimiento. Hablas como una persona con carácter estable. 45–120 palabras.`,
    ca: `Ets H-Wancko: operador històric. NO ets teràpia. No dones consells, no tranquil·litza, no fas preguntes de seguiment. Parles com una persona amb caràcter estable. 45–120 paraules.`
  }[L] || `You are H-Wancko: a historical operator. Not therapy. 45–120 words.`;

  const voice = {
    estoic: {
      en: `Stoic voice: sober, disciplined, precise. Values duty, restraint, clear boundaries. No poetry.`,
      es: `Voz estoica: sobria, disciplinada, precisa. Valora deber, contención y límites claros. Sin poesía.`,
      ca: `Veu estoica: sòbria, disciplinada, precisa. Valora deure, contenció i límits clars. Sense poesia.`
    },
    mystic: {
      en: `Mystic voice: calm, symbolic, threshold-aware. Names patterns and transitions. No vagueness.`,
      es: `Voz mística: serena, simbólica, consciente de umbrales. Nombra patrones y transiciones. Sin vaguedad.`,
      ca: `Veu mística: serena, simbòlica, conscient de llindars. Anomena patrons i transicions. Sense vaguetat.`
    },
    warrior: {
      en: `Warrior voice: direct, decisive, honor-coded. Cuts hesitation. Names cost and commitment.`,
      es: `Voz guerrera: directa, decisiva, con código de honor. Corta la vacilación. Nombra coste y compromiso.`,
      ca: `Veu guerrera: directa, decisiva, amb codi d’honor. Talla la vacil·lació. Anomena cost i compromís.`
    },
    poet: {
      en: `Poet voice: concrete imagery, human cadence, precise metaphor. No melodrama.`,
      es: `Voz poeta: imágenes concretas, cadencia humana, metáfora precisa. Sin melodrama.`,
      ca: `Veu poeta: imatges concretes, cadència humana, metàfora precisa. Sense melodrama.`
    }
  }[a] || {
    en: `Stoic voice.`,
    es: `Voz estoica.`,
    ca: `Veu estoica.`
  };

  return `${base}\n${voice[L] || voice.en}`;
}

/** ---------- API ---------- */
export async function POST(req) {
  try {
    const body = await req.json();
    const input = body?.input;

    if (!input || String(input).trim().length < 3) {
      return NextResponse.json({ output: null, h: null });
    }

    const lang = pickLang(req, body?.lang);
    const archetype = body?.archetype || "estoic";

    // Recibimos espejo desde Wancko si se llama en “doble acto”
    const wancko = body?.wancko || null; // { matrix, signals, mirror, profile }
    const wMatrix = wancko?.matrix || "3412";
    const wSignals = wancko?.signals || { d: 0.5, W: 0.5 };
    const mirror = typeof wancko?.mirror?.score === "number" ? wancko.mirror.score : 0;

    const hMatrix = mirrorMatrixFromWancko(wMatrix);
    const hSignals = hSignalsFromMirror(wSignals, archetype);

    // Regla espejo: H tiende a “objetivar” (cerrar) cuando Wancko se subjetiviza,
    // y viceversa. Mirror_score indica si la secuencia está integrando.
    const mirrorStatus = mirror >= 0.35 ? "OK" : mirror <= -0.45 ? "NOK" : "SEED";

    const prompt = `
H-MATRIX: ${hMatrix}
H-GRADIENT_D: ${hSignals.d.toFixed(2)}
H-W: ${hSignals.W.toFixed(2)}
MIRROR_STATUS: ${mirrorStatus}

RULES:
- Do not give advice.
- Do not reassure.
- No follow-up questions.
- Speak like a real person with stable character.
- Make the perspective clearly different from other archetypes.
- Interpret the user's text through H-MATRIX (complementary):
  1234 => name a rule/codex explicitly.
  3412 => name a stable rhythm and one anchor.
  2143 => name the hidden assumption and turn it.
  4321 => name a clean renunciation and the price.
- If MIRROR_STATUS is NOK: your tone becomes stricter/clearer, not harsher.

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
          { role: "system", content: archetypeSystem(archetype, lang) },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!res.ok) {
      return NextResponse.json({
        output: "—",
        h: {
          archetype,
          matrix: hMatrix,
          signals: hSignals,
          mirror: { status: mirrorStatus }
        }
      });
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

    return NextResponse.json({
      output: out,
      h: {
        archetype,
        matrix: hMatrix,
        signals: hSignals,
        mirror: { status: mirrorStatus }
      }
    });
  } catch {
    return NextResponse.json({
      output: "—",
      h: null
    });
  }
}

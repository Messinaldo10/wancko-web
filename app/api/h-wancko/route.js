import { NextResponse } from "next/server";

/** =========================================================
 * H-WANCKO API — v0.4 (arquetipos humanos + espejo AU)
 * - Respuesta persona (OpenAI) con voz estable por arquetipo
 * - Barra/colores propios: Luz ↔ Violeta ↔ Noche
 * - Complementario espejo: OK intermedio al inicio, deriva por cadena
 * - Comparte session (facts + chain) con Wancko
 * ========================================================= */

const MAX_H_CHAIN = 18;

function pickLang(req, fallback = "es") {
  const h = req.headers.get("accept-language") || "";
  const l = h.slice(0, 2).toLowerCase();
  return ["es", "ca", "en"].includes(l) ? l : fallback;
}

function normalizeSession(prev) {
  const base = prev && typeof prev === "object" ? prev : {};
  const facts = base.facts && typeof base.facts === "object" ? base.facts : {};
  const hChain = Array.isArray(base.h_chain) ? base.h_chain : [];
  return {
    ...base,
    v: base.v || 2,
    facts,
    h_chain: hChain
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function hSignalsFromChain(session, seed) {
  // Queremos OK inicial intermedio: empezamos cerca de 0.5 y derivamos.
  const c = Array.isArray(session.h_chain) ? session.h_chain : [];
  let L = 0.52; // 0=noche (NOK), 0.5=violeta/crepúsculo (OK neutro), 1=día (OK)

  // deriva por tendencia: si hay mucha “ruptura” (d alto) en Wancko, H tiende a oscuridad,
  // si hay mucha “estructura” (d bajo) en Wancko, H tiende a luz.
  // Como no siempre tendremos d, usamos semillas del propio H y señales suaves.
  if (c.length >= 2) {
    const last = c[c.length - 1];
    const prev = c[c.length - 2];
    // si repite “tensión”, oscurece un poco
    if (last?.tone === "night" && prev?.tone === "night") L -= 0.06;
    if (last?.tone === "day" && prev?.tone === "day") L += 0.04;
  }

  // micro-vida determinista
  L += (seed - 0.5) * 0.08;

  L = clamp01(L);

  let tone = "violet";
  if (L >= 0.68) tone = "day";
  if (L <= 0.32) tone = "night";

  // barra “claridad” = L
  return { L, tone };
}

const ARCHETYPES = {
  estoic: {
    name: "Estoic",
    style: "calm, grounded, concise, disciplined, no drama",
    inverse: "prefers structure over release; turns doubt into duty"
  },
  mystic: {
    name: "Mystic",
    style: "symbolic, luminous, soft but precise, threshold language",
    inverse: "prefers inversion/meaning over structure; frames release as passage"
  },
  warrior: {
    name: "Warrior",
    style: "direct, decisive, energetic, responsibility, action",
    inverse: "prefers commitment; cuts through doubt; channels tension into a move"
  },
  poet: {
    name: "Poet",
    style: "human, intimate, metaphor with restraint, feels like a person",
    inverse: "prefers truth-by-image; holds ambiguity without collapsing"
  }
};

export async function POST(req) {
  try {
    const lang = pickLang(req, "es");
    const body = await req.json();

    const input = body?.input ? String(body.input) : "";
    const archetype = body?.archetype || "estoic";
    const prevSession = body?.session || null;

    let session = normalizeSession(prevSession);

    if (!input || input.trim().length < 2) {
      const seed = 0.51;
      const signals = hSignalsFromChain(session, seed);
      return NextResponse.json({
        output: null,
        signals,
        session
      });
    }

    const key = ARCHETYPES[archetype] ? archetype : "estoic";
    const A = ARCHETYPES[key];

    // seed determinista por cadena + input
    const seed = (() => {
      let h = 2166136261;
      const s = `${(session.h_chain?.length || 0) + 1}::${input}`;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) / 4294967295;
    })();

    const signals = hSignalsFromChain(session, seed);

    // guardamos mínima traza (sin texto)
    const item = {
      t: Date.now(),
      archetype: key,
      tone: signals.tone,
      L: signals.L
    };
    session.h_chain = [...(session.h_chain || []).slice(-(MAX_H_CHAIN - 1)), item];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fallback =
        lang === "ca"
          ? "En el meu temps, la claredat no venia de parlar més, sinó de sostenir el moment."
          : lang === "en"
          ? "In my time, clarity didn’t come from talking more, but from holding the moment."
          : "En mi tiempo, la claridad no venía de hablar más, sino de sostener el momento.";
      return NextResponse.json({
        output: fallback,
        signals,
        session
      });
    }

    const prompt = `
ARCHETYPE: ${A.name}
VOICE: ${A.style}
INVERSE_AU: ${A.inverse}

H-SIGNALS:
tone=${signals.tone} (day/violet/night)
L=${signals.L.toFixed(2)} (0..1)

FACTS (if any, do not invent):
${Object.keys(session.facts || {}).length ? JSON.stringify(session.facts) : "none"}

RULES:
- Sound like a person of that archetype (not robotic)
- No therapy framing, no advice list
- No fake promises (memory only if declared)
- One response, 2–5 sentences, max ~90 words
- Match language: ${lang}

USER:
${input}
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are H-Wancko: a historical archetype voice. Human, consistent." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

    return NextResponse.json({
      output: out,
      signals,
      session
    });
  } catch {
    return NextResponse.json({
      output: "—",
      signals: { L: 0.52, tone: "violet" },
      session: null
    });
  }
}

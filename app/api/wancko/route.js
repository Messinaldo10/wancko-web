import { NextResponse } from "next/server";

/* =========================================================
   WANCKO API — AU v0.5
   - Wancko: subjetividad modulada
   - H-Wancko: objetividad por figura (no role-play)
   - Perfil AU del usuario (emergente)
   ========================================================= */

/* ---------------- AU PARSER ---------------- */

function parseAU(input) {
  const text = input.toLowerCase().trim();

  const mode = text.includes("we") || text.includes("they") ? "GM" : "GC";

  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text) ? "DCN" : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|need to|debo|tengo que|cal|hauria|he de)/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|doubt|uncertain|confused|por qué|dudo|no entiendo|per què|dubto)/.test(text) ||
    /\?$/.test(text) ||
    /(qué es|que es|what is|què és)/.test(text)
  ) {
    matrix = "2143";
  } else if (
    /(let go|stop|quit|release|enough|dejar|parar|soltar|basta|deixar|aturar|prou)/.test(text)
  ) {
    matrix = "4321";
  }

  let N_level = "N3";
  if (/(panic|obsessed|ansiedad|obses)/.test(text)) N_level = "N1";
  if (/(harm|force|violence|dañar|forzar)/.test(text)) N_level = "N0";

  let intervention = "Answer";
  if (N_level === "N0" || N_level === "N1") intervention = "Silence";
  else if (text.includes("?")) intervention = "StrategicQuestion";

  const sense = matrix === "2143" ? "inverse" : "direct";

  return { mode, screen, matrix, sense, intervention, N_level };
}

/* ---------------- JURAMENTO COMO OPERADOR ---------------- */

function applyJuramento(matrix, juramento, screen) {
  if (!juramento) return matrix;
  const j = String(juramento).toLowerCase();

  if (j === "disciplina") return matrix === "4321" ? "3412" : "1234";
  if (j === "ansiedad") return "2143";
  if (j === "límites" || j === "limites")
    return screen === "DCN" ? "2143" : matrix === "4321" ? "3412" : matrix;
  if (j === "excesos") return matrix === "3412" ? "4321" : matrix;
  if (j === "soltar") return "4321";

  return matrix;
}

/* ---------------- PERFIL AU DEL USUARIO ---------------- */

function updateUserProfile(prev, au) {
  const base = prev || {
    control: 0.5,
    uncertainty: 0.5,
    dissolution: 0.5,
    narrative: 0.5
  };

  const step = 0.03;

  if (au.matrix === "1234") base.control += step;
  if (au.matrix === "2143") base.uncertainty += step;
  if (au.matrix === "4321") base.dissolution += step;
  if (au.matrix === "3412") base.narrative += step;

  for (const k in base) {
    base[k] = Math.max(0, Math.min(1, base[k]));
  }

  return base;
}

/* ---------------- FIGURAS H-WANCKO ---------------- */

function reinterpretMatrixForFigure(matrix, archetype) {
  switch (archetype) {
    case "estoic":
      return matrix === "2143" || matrix === "4321" ? "1234" : "3412";
    case "mystic":
      return "4321";
    case "warrior":
      return matrix === "2143" ? "2143" : "1234";
    case "poet":
      return "3412";
    default:
      return matrix;
  }
}

/* ---------------- ANTI-LOOP ---------------- */

function recentRepeat(chain, matrix) {
  return chain.slice(-4).filter(x => x.matrix === matrix).length;
}

function antiLoopDecision(session, au) {
  if (!session?.chain) return null;

  const rep = recentRepeat(session.chain, au.matrix);
  const last5 = session.chain.slice(-5);

  if (last5.some(x => x.N === "N0")) return "silence";
  if (last5.filter(x => x.N === "N1").length >= 2) return "silence";

  if (rep >= 3) return "break";

  return null;
}

/* ---------------- GRADIENTE + W ---------------- */

function auSignals(au, session, juramento) {
  let d =
    au.matrix === "1234" ? 0.22 :
    au.matrix === "3412" ? 0.45 :
    au.matrix === "2143" ? 0.6 :
    0.82;

  if (au.screen === "DCN") d += 0.08;

  const j = juramento?.toLowerCase();
  if (j === "disciplina") d -= 0.05;
  if (j === "ansiedad") d += 0.05;
  if (j === "soltar") d += 0.12;

  const rep = recentRepeat(session?.chain || [], au.matrix);
  if (rep >= 2) d += 0.05;

  d = Math.max(0, Math.min(1, d));

  let tone = "amber";
  if (d < 0.3) tone = "green";
  if (d > 0.68) tone = "red";

  let W =
    au.matrix === "1234" ? 0.3 :
    au.matrix === "3412" ? 0.5 :
    au.matrix === "2143" ? 0.65 :
    0.8;

  W = Math.max(0, Math.min(1, W));

  return { d, tone, W, sense: au.sense };
}

/* ---------------- SESSION ---------------- */

function nextSession(prev, au, signals, anti, profile) {
  const base = prev || {};
  const chain = base.chain || [];

  return {
    v: 1,
    turns: (base.turns || 0) + 1,
    profile,
    chain: [
      ...chain.slice(-19),
      {
        t: Date.now(),
        matrix: au.matrix,
        N: au.N_level,
        d: signals.d,
        W: signals.W,
        anti
      }
    ]
  };
}

/* ---------------- ARPI ---------------- */

function arpiCert(session) {
  const turns = session?.turns || 0;
  const last5 = session?.chain?.slice(-5) || [];

  if (turns < 2) return { level: "seed" };
  if (last5.some(x => x.N === "N0")) return { level: "blocked" };
  if (last5.some(x => x.N === "N1")) return { level: "unstable" };
  return { level: "ok" };
}

/* =========================================================
   API POST
   ========================================================= */

export async function POST(req) {
  try {
    const body = await req.json();
    const { input, session, juramento, mode, archetype } = body;

    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null, au: null, session, cert: { level: "seed" } });
    }

    let au = parseAU(input);

    if (mode !== "historical") {
      au.matrix = applyJuramento(au.matrix, juramento, au.screen);
    }

    au.sense = au.matrix === "2143" ? "inverse" : "direct";

    const anti = antiLoopDecision(session, au);

    const signals = auSignals(au, session, juramento);

    const profile = updateUserProfile(session?.profile, au);

    const newSession = nextSession(session, au, signals, anti, profile);

    const cert = arpiCert(newSession);

    if (au.intervention === "Silence" || anti === "silence") {
      return NextResponse.json({
        output: "—",
        au: { ...au, signals, anti },
        session: newSession,
        cert
      });
    }

    /* ---------- H-WANCKO (objetivo) ---------- */
    if (mode === "historical") {
      const figMatrix = reinterpretMatrixForFigure(au.matrix, archetype);

      const prompt = `
You are not assisting.
You are interpreting reality as a ${archetype.toUpperCase()}.

You do not adapt.
You do not reassure.
You do not explain.

Reality is read through matrix ${figMatrix}.
Speak briefly. With certainty.

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
          messages: [{ role: "user", content: prompt }],
          temperature: 0.6
        })
      });

      const data = await res.json();
      const out = data?.choices?.[0]?.message?.content?.trim() || "—";

      return NextResponse.json({
        output: out,
        au: { ...au, signals, matrix: figMatrix },
        session: newSession,
        cert
      });
    }

    /* ---------- WANCKO (subjetivo) ---------- */
    const prompt = `
MODE: ${au.mode}
SCREEN: ${au.screen}
MATRIX: ${au.matrix}
JURAMENTO: ${juramento || "none"}

RULES:
- Reflect without comforting
- One short intervention
- Match user language

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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.35
      })
    });

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "—";

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

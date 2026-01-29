import { NextResponse } from "next/server";

/**
 * H-WANCKO — Operador histórico AU
 * - No terapia
 * - No consejo
 * - No seguimiento
 * - Interpreta AU desde un sujeto fijo
 */

/* ---------- AU MINIMAL PARSER ---------- */
function parseAU(input) {
  const text = input.toLowerCase().trim();

  const screen =
    /(tired|empty|burnout|agotad|vac[ií]o|cansad)/.test(text)
      ? "DCN"
      : "RAV";

  let matrix = "3412";

  if (/(should|must|have to|debo|tengo que)/.test(text)) {
    matrix = "1234";
  } else if (
    /(why|what is|qué es|por qué|\?$)/.test(text)
  ) {
    matrix = "2143";
  } else if (
    /(let go|soltar|basta|enough|parar)/.test(text)
  ) {
    matrix = "4321";
  }

  return { matrix, screen };
}

/* ---------- INTERPRETACIÓN POR FIGURA ---------- */
function interpret(matrix, screen, archetype) {
  switch (archetype) {
    case "estoic":
      // El estoico reduce todo a forma y contención
      if (matrix === "4321") return "Excess dissolves what discipline could have held.";
      if (matrix === "2143") return "Doubt is noise when duty is clear.";
      if (matrix === "1234") return "Structure is not comfort. It is necessity.";
      return "Endurance gives shape to what persists.";

    case "mystic":
      // El místico ve tránsito, no estados
      if (matrix === "1234") return "What you call order is only a veil before surrender.";
      if (matrix === "2143") return "Confusion marks the opening of a threshold.";
      if (matrix === "4321") return "Nothing is lost when form is released.";
      return "Between sense and silence, meaning ripens.";

    case "warrior":
      // El guerrero polariza: acción / no-acción
      if (matrix === "2143") return "Hesitation fractures the moment.";
      if (matrix === "4321") return "Retreat is still a move, but rarely a victory.";
      if (matrix === "1234") return "Rules exist to be enacted, not debated.";
      return "Stability is forged, not awaited.";

    case "poet":
      // El poeta habita la ambigüedad
      if (matrix === "1234") return "Order hums until something unsayable interrupts it.";
      if (matrix === "2143") return "The question lingers longer than the answer.";
      if (matrix === "4321") return "When form breaks, resonance remains.";
      return "Meaning curves where certainty cannot.";

    default:
      return "History rarely spoke in one voice.";
  }
}

/* ---------- API ---------- */
export async function POST(req) {
  try {
    const { input, archetype } = await req.json();

    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null });
    }

    const key =
      archetype && ["estoic", "mystic", "warrior", "poet"].includes(archetype)
        ? archetype
        : "estoic";

    const au = parseAU(input);
    const output = interpret(au.matrix, au.screen, key);

    return NextResponse.json({
      output,
      meta: {
        archetype: key,
        matrix: au.matrix,
        screen: au.screen,
        historical: true
      }
    });
  } catch {
    return NextResponse.json({
      output: "Silence was also a form of record."
    });
  }
}

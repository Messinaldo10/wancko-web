import { NextResponse } from "next/server";

/**
 * H-WANCKO
 * Operador histórico.
 * No terapia. No consejo. No seguimiento.
 */

const ARCHETYPES = {
  estoic: {
    voice: "estoic",
    respond: (input) =>
      "In my time, clarity came from enduring the moment without escaping it."
  },
  mystic: {
    voice: "mystic",
    respond: (input) =>
      "What you call confusion, we called the fog before a threshold."
  },
  warrior: {
    voice: "warrior",
    respond: (input) =>
      "Hesitation was costlier than error where I come from."
  },
  poet: {
    voice: "poet",
    respond: (input) =>
      "We learned the shape of truth by listening to what refused to be said."
  }
};

export async function POST(req) {
  try {
    const { input, archetype } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null });
    }

    const key = ARCHETYPES[archetype] ? archetype : "estoic";
    const reply = ARCHETYPES[key].respond(input);

    return NextResponse.json({
      output: reply,
      meta: {
        archetype: key,
        historical: true
      }
    });
  } catch {
    return NextResponse.json({
      output: "Silence was also an answer in my time."
    });
  }
}

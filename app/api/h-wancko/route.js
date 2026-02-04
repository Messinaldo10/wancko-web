// app/api/h-wancko/route.js
import { NextResponse } from "next/server";

/**
 * =========================================================
 * H-WANCKO — Operador histórico AU (C-2)
 * Subjetividad dominante · Memoria lenta · Voz humana
 * =========================================================
 */

/* ---------- ARQUETIPOS ---------- */
const ARCHETYPES = {
  estoic: {
    name: "Estoic",
    baseTone: "light", // día
    voice: (state) => {
      if (state.matrix === "1234")
        return "Nombrar lo esencial es ya un acto de orden.";
      if (state.matrix === "2143")
        return "La duda no se evita: se atraviesa con calma.";
      if (state.matrix === "4321")
        return "Cuando todo cae, queda el pulso. Sosténlo.";
      return "Permanece. No todo pide respuesta inmediata.";
    }
  },

  mystic: {
    name: "Místic",
    baseTone: "violet", // crepúsculo
    voice: (state) => {
      if (state.matrix === "1234")
        return "La forma aparece cuando el velo se retira.";
      if (state.matrix === "2143")
        return "La inversión es una puerta, no un error.";
      if (state.matrix === "4321")
        return "Disolverse también es una manera de llegar.";
      return "El silencio revela más de lo que promete.";
    }
  },

  warrior: {
    name: "Guerrer",
    baseTone: "dark", // noche
    voice: (state) => {
      if (state.matrix === "1234")
        return "Decidir es cortar. No lo retrases.";
      if (state.matrix === "2143")
        return "Si dudas, el enemigo avanza dentro.";
      if (state.matrix === "4321")
        return "Quemar el pasado a veces es avanzar.";
      return "Mantén la guardia. El tiempo decide.";
    }
  },

  poet: {
    name: "Poeta",
    baseTone: "violet",
    voice: (state) => {
      if (state.matrix === "1234")
        return "El orden también puede cantar.";
      if (state.matrix === "2143")
        return "Lo que gira revela su verdad al volver.";
      if (state.matrix === "4321")
        return "Caer es una forma lenta de escribir.";
      return "Escucha lo que insiste sin palabras.";
    }
  }
};

/* ---------- MATRIZ ESPEJO (clave AU) ---------- */
function mirrorMatrix(matrix) {
  // Wancko: objetivo → subjetivo
  // H-Wancko: subjetivo → objetivo
  if (matrix === "1234") return "4321";
  if (matrix === "4321") return "1234";
  if (matrix === "2143") return "3412";
  if (matrix === "3412") return "2143";
  return "3412";
}

/* ---------- MEMORIA LENTA (patrones) ---------- */
function updateArchetypeMemory(prev, matrix) {
  const mem = prev && typeof prev === "object" ? { ...prev } : {};
  mem[matrix] = (mem[matrix] || 0) + 1;
  return mem;
}

/* ---------- BARRA SUBJETIVA (S) ---------- */
function computeS(matrix, memory) {
  let S =
    matrix === "1234" ? 0.25 :
    matrix === "3412" ? 0.45 :
    matrix === "2143" ? 0.65 :
    matrix === "4321" ? 0.80 :
    0.45;

  // memoria histórica estabiliza (no salta)
  const total = Object.values(memory || {}).reduce((a, b) => a + b, 0);
  if (total > 4) S -= 0.05;

  return Math.max(0, Math.min(1, S));
}

/* ---------- COLOR HISTÓRICO ---------- */
function computeTone(baseTone, S) {
  // día → violeta → noche
  if (S < 0.35) return "day";
  if (S < 0.65) return "twilight";
  return "night";
}

/* ---------- API ---------- */
export async function POST(req) {
  try {
    const { input, archetype, session } = await req.json();
    if (!input || input.trim().length < 3) {
      return NextResponse.json({ output: null });
    }

    const key = ARCHETYPES[archetype] ? archetype : "estoic";
    const A = ARCHETYPES[key];

    // heredamos matriz de Wancko pero la espejamos
    const prevMatrix = session?.last?.matrix || "3412";
    const matrix = mirrorMatrix(prevMatrix);

    // memoria lenta
    const memory = updateArchetypeMemory(session?.memory, matrix);

    const S = computeS(matrix, memory);
    const tone = computeTone(A.baseTone, S);

    const output = A.voice({ matrix });

    return NextResponse.json({
      output,
      au: {
        matrix,
        tone,
        S,
        archetype: key
      },
      session: {
        memory,
        last: { matrix }
      }
    });
  } catch {
    return NextResponse.json({
      output: "El silencio también forma parte del relato."
    });
  }
}

/**
 * Juramento AU v0
 * No moraliza. No bloquea. Inclina.
 */

export function applyJuramento(au, juramento) {
  if (!juramento) return au;

  const j = juramento.toLowerCase();

  const next = { ...au };

  // Juramentos de contención
  if (["disciplina", "límites", "focus"].includes(j)) {
    if (au.matrix === "3412") next.matrix = "1234";
    if (au.N_level === "N3") next.N_level = "N2";
  }

  // Juramentos de alivio
  if (["ansiedad", "exceso", "burnout"].includes(j)) {
    if (au.matrix === "1234") next.matrix = "2143";
    if (au.N_level === "N1") next.N_level = "N2";
  }

  // Juramentos de ruptura consciente
  if (["soltar", "cerrar ciclo"].includes(j)) {
    next.matrix = "4321";
  }

  return next;
}

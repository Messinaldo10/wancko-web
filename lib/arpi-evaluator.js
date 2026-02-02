/**
 * ARPI evaluator
 * Certificación por trayectoria (OK/NOK espejo) — no por estado puntual.
 */

export function evaluateMirror(prevMirror, au, signals, anti) {
  let delta = 0;

  // Tonos (resultado del gradiente real)
  if (signals.tone === "green") delta += 0.07;
  if (signals.tone === "red") delta -= 0.10;

  // Matriz (interpretación)
  if (au.matrix === "1234") delta += 0.05; // estructura clara
  if (au.matrix === "3412") delta += 0.02; // continuidad
  if (au.matrix === "2143") delta -= 0.03; // duda/inversión sostenida baja espejo
  if (au.matrix === "4321") delta += 0.01; // disolución puede ser liberadora si no es bucle

  // Anti-loop útil suma (salida consciente)
  if (anti === "break" || anti === "ground") delta += 0.06;

  // N penaliza fuerte (seguridad/deriva)
  if (au.N_level === "N2") delta -= 0.02;
  if (au.N_level === "N1") delta -= 0.14;
  if (au.N_level === "N0") delta -= 0.28;

  let mirror = (typeof prevMirror === "number" ? prevMirror : 0) + delta;
  mirror = Math.max(-1, Math.min(1, mirror));
  return mirror;
}

export function arpiFromTrajectory(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const mirror = typeof state?.mirror === "number" ? state.mirror : 0;

  if (log.length < 3) return { level: "seed" };

  // Miramos los últimos 8 eventos AU para estabilidad
  const last = log.slice(-8);
  const n0 = last.some((x) => x?.N === "N0");
  const n1 = last.filter((x) => x?.N === "N1").length;

  if (n0) return { level: "blocked" };
  if (n1 >= 2) return { level: "unstable" };

  // Umbrales espejo
  if (mirror >= 0.25) return { level: "ok" };
  if (mirror < -0.25) return { level: "blocked" };

  return { level: "seed" };
}

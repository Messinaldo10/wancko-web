/**
 * AU LOG
 * Registro de trayectoria conversacional AU (sin exponer contenido sensible por defecto).
 * Nota: aquí guardamos meta + textos (por ahora). Si luego quieres "sin texto", lo cambiamos.
 */

export function initLog(prev) {
  if (prev && Array.isArray(prev.log)) {
    return {
      log: prev.log,
      mirror: typeof prev.mirror === "number" ? prev.mirror : 0, // -1..+1
      stableCount: typeof prev.stableCount === "number" ? prev.stableCount : 0
    };
  }
  return {
    log: [],
    mirror: 0,
    stableCount: 0
  };
}

export function appendLog(state, entry) {
  const log = Array.isArray(state.log) ? state.log : [];
  return {
    ...state,
    log: [
      ...log.slice(-79), // guardamos hasta 80 eventos
      { t: Date.now(), ...entry }
    ]
  };
}

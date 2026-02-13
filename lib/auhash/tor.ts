// lib/auhash/tor.ts
import type { AUHashState, TorEvent } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function shannonEntropy(probs: number[]): number {
  const p = probs.filter((x) => x > 0);
  if (!p.length) return 0;
  let h = 0;
  for (const pi of p) h += -pi * Math.log(pi);
  return h;
}

export type TorDecision = {
  /** “hold” = quedarse (proteger/arbitrar); “release” = soltar */
  hold: boolean;
  /** anti-loop sugerido a UI */
  anti: null | "silence" | "break";
  /** entropía normalizada 0..1 */
  entropy: number;
  /** coherencia 0..1 (dominancia controlada) */
  coherence: number;
  /** token/key preferido (puede rotar) */
  pick: MemoryHit | null;

  /** métricas para estética (NO hardcode fijo) */
  complexity: number;
  beauty: number;

  /** explicación corta */
  reason: string;
};

/**
 * TOR aplica homeostasis:
 * - si entropía baja → conserva (hold suave + menos decay)
 * - si entropía alta → desprende (release + más decay + suspende dominantes)
 *
 * Y nunca “borra”: registra eventos y suspende/reactiva.
 */
export function applyTor(
  mode: "wancko" | "hwancko",
  state: AUHashState,
  hits: MemoryHit[],
  turns: number,
  now: number = Date.now()
): { state: AUHashState; decision: TorDecision; hits: MemoryHit[] } {
  const s = state;

  // --- Distribución para entropía ---
  const scores = hits.map((h) => Math.max(0, h.score || 0));
  const sum = scores.reduce((a, b) => a + b, 0) || 1;
  const probs = scores.map((x) => x / sum);

  const H = shannonEntropy(probs);
  const Hmax = Math.log(Math.max(1, probs.length));
  const entropy = Hmax > 0 ? clamp01(H / Hmax) : 0;

  // dominancia (top share)
  const top = hits[0] || null;
  const topShare = top ? clamp01((top.score || 0) / sum) : 0;

  // coherencia: alta si hay un “centro” pero sin monopolio extremo
  const coherence = clamp01(1 - Math.abs(topShare - 0.42) * 1.6);

  // Homeostasis: targetEntropy depende de turnos (al inicio queremos subir estructura)
  const targetEntropy = clamp01(turns < 6 ? 0.32 : 0.45);

  const deltaE = entropy - targetEntropy;
  const tooChaotic = deltaE > 0.08;
  const tooFlat = deltaE < -0.08;

  // --- anti-loop + rotación ---
  const meta = s.memory.meta;
  const lastPicked = meta.lastPickedKey;

  // si repite top con frecuencia, incrementa stuck
  const sameTop = !!(top && lastPicked && top.key === lastPicked);
  const stuckCount = sameTop ? meta.stuckCount + 1 : Math.max(0, meta.stuckCount - 1);

  // reglas:
  // - en caos: suspender dominantes si repiten
  // - en plano: conservar (hold) y NO suspender, pero reducir rotación para consolidar
  let anti: TorDecision["anti"] = null;

  let pick: MemoryHit | null = top;

  if (tooChaotic) {
    // si hay demasiado ruido, forzamos “release”: rotación hacia 2º/3º y cortamos loops
    anti = stuckCount >= 2 ? "break" : "silence";

    if (hits.length >= 2 && sameTop) {
      pick = hits[1] || pick;
    } else if (hits.length >= 3 && stuckCount >= 3) {
      pick = hits[2] || pick;
    }
  } else if (tooFlat) {
    // si hay poca entropía, conservar para construir hash (hold)
    anti = sameTop && stuckCount >= 3 ? "silence" : null;
    // pick = top (conservador)
  } else {
    // zona sana: si repite demasiado, rotación ligera
    if (sameTop && stuckCount >= 3 && hits.length >= 2) {
      pick = hits[1];
      anti = "silence";
    }
  }

  // --- Aplicar “suspensión” (no borrar) ---
  // Suspender SOLO cuando hay caos + repetición (monopolio patológico)
  const topics = { ...s.memory.topics };
  const events: TorEvent[] = [...meta.events];
  const topHistory = [...meta.topHistory];

  if (tooChaotic && sameTop && top) {
    const t0 = topics[top.key];
    if (t0) {
      // suspensión proporcional a caos (más entropía => más tiempo)
      const ttl = 12000 + Math.round(entropy * 24000); // 12..36s
      const until = Math.max(t0.suspendedUntil || 0, now + ttl);
      topics[top.key] = { ...t0, suspendedUntil: until };

      events.push({
        t: now,
        mode,
        action: "suspend",
        token: top.token,
        key: top.key,
        domain: top.domain,
        causes: [top.key],
        effects: [`suspendedUntil=${until}`, `entropy=${entropy.toFixed(2)}`],
        suspended: true
      });
    }
  }

  // Reactivar cuando hay poca entropía (conservar): reducimos suspensión aceleradamente
  if (tooFlat) {
    for (const [k, t] of Object.entries(topics)) {
      if (t.suspendedUntil > 0 && t.suspendedUntil > now) {
        const shorten = 8000; // reactiva antes
        const newUntil = Math.max(0, t.suspendedUntil - shorten);
        topics[k] = { ...t, suspendedUntil: newUntil };
      }
    }
    events.push({
      t: now,
      mode,
      action: "activate",
      domain: "meta",
      causes: [],
      effects: ["reactivation-pass"],
      suspended: false
    });
  }

  // --- Decay adaptativo (conservar vs soltar) ---
  // si caos: decay más agresivo para desprender; si plano: decay suave
  const decay = tooChaotic ? 0.035 : tooFlat ? 0.010 : 0.020;

  for (const [k, t] of Object.entries(topics)) {
    const age = Math.max(0, now - (t.last || now));
    const ageFactor = clamp01(age / 120000); // 2min
    const d = decay * (0.35 + 0.65 * ageFactor);

    // “pierde relevancia lo que se recuerda”:
    // si fue pick recientemente, aplicamos un decay extra leve (anti-apego a lo recordado)
    const pickedRecently = pick && k === pick.key && age < 45000;
    const extra = pickedRecently ? 0.010 : 0;

    const w2 = clamp01(t.w - d - extra);
    topics[k] = { ...t, w: w2 };
  }

  // --- Registrar decisión causal (hash/nohash, hold/release) ---
  const hold = tooFlat ? true : tooChaotic ? false : (coherence < 0.42 ? true : false);

  const action: TorEvent["action"] = hold ? "hold" : "release";
  events.push({
    t: now,
    mode,
    action,
    token: pick?.token,
    key: pick?.key,
    domain: pick?.domain || "meta",
    causes: hits.slice(0, 4).map((h) => h.key),
    effects: [
      `entropy=${entropy.toFixed(2)}`,
      `coherence=${coherence.toFixed(2)}`,
      `anti=${anti || "none"}`,
      `pick=${pick?.key || "none"}`
    ]
  });

  // --- Historia top ---
  if (pick) {
    topHistory.push({ t: now, key: pick.key, token: pick.token, domain: pick.domain });
    while (topHistory.length > 32) topHistory.shift();
  }

  // meta update
  const newMeta = {
    ...meta,
    stuckCount,
    lastPickedKey: pick?.key || null,
    topHistory,
    events: events.slice(-220) // cap
  };

  const nextState: AUHashState = {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      topics,
      meta: newMeta
    }
  };

  // Estética derivada (no fija):
  // complexity: sube con turns, y también con entropía moderada
  const complexity = clamp01((Math.log2(2 + turns) / 6) * 0.55 + entropy * 0.45);
  // beauty: sube cuando hay control (coherence) y no hay caos extremo
  const beauty = clamp01(coherence * 0.75 + (1 - entropy) * 0.25);

  const reason = tooChaotic
    ? "too_chaotic→shed"
    : tooFlat
      ? "too_flat→conserve"
      : "balanced";

  const decision: TorDecision = {
    hold,
    anti,
    entropy,
    coherence,
    pick,
    complexity,
    beauty,
    reason
  };

  // recomputar hits (porque hemos decaído/suspendido)
  // (simple: el route volverá a llamar queryMemory si quiere, pero lo dejamos opcional)
  return { state: nextState, decision, hits };
}

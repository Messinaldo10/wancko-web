// lib/auhash/tor.ts
import type { AUHashState, TorEvent } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function nowMs(): number {
  return Date.now();
}

/**
 * TOR homeostasis:
 * - Si el top se repite demasiado -> “suspend” temporal del key dominante.
 * - Si hay poca entropía (pocos hits) -> conserva (no suspende).
 * - Si hay mucha entropía (muchos hits + dominancia alta) -> desprende (suspende top o rota).
 *
 * No borra nada: solo ajusta suspendedUntil y registra eventos.
 */
export function applyTor(
  prev: AUHashState,
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  borrowedTopToken?: string
): AUHashState {
  const s: AUHashState = prev;
  const now = nowMs();

  const topics = { ...s.memory.topics };
  const meta = { ...s.memory.meta };
  const events: TorEvent[] = meta.events.slice(-180); // cap

  const top = hits[0];
  const second = hits[1];

  // si no hay top, “conservar” (no tocar)
  if (!top) {
    return {
      ...s,
      memory: {
        ...s.memory,
        topics,
        meta: { ...meta, events }
      }
    };
  }

  // entropía simple: más hits + más diversidad (aprox)
  const sumW = hits.reduce((acc, h) => acc + (h.w || 0), 0) || 1;
  const dominance = clamp01((top.w || 0) / sumW);
  const entropy = clamp01((hits.length / 10) * (1 - dominance));

  // stuck detection
  const sameAsLast = meta.lastPickedKey === top.key;
  const stuckCount = sameAsLast ? meta.stuckCount + 1 : 0;

  meta.lastPickedKey = top.key;
  meta.stuckCount = stuckCount;

  // topHistory (prestado)
  meta.topHistory = (meta.topHistory || []).concat([
    { t: now, key: top.key, token: borrowedTopToken || top.token || undefined, domain: top.domain }
  ]).slice(-160);

  // regla base: si muy repetido, suspendemos top; si hay poca entropía, no.
  const lowEntropy = entropy < 0.18 && hits.length <= 3;
  const highDominance = dominance > 0.62;

  // cuánto suspender (ms)
  const baseSuspend = 25_000; // 25s
  const suspendMs = Math.round(baseSuspend * (1 + stuckCount * 0.55 + dominance));

  // activar liberaciones (si ya pasó el tiempo)
  for (const [k, v] of Object.entries(topics)) {
    if (v.suspendedUntil > 0 && v.suspendedUntil <= now) {
      topics[k] = { ...v, suspendedUntil: 0 };
      events.push({
        t: now,
        mode,
        action: "activate",
        key: k,
        domain: v.domain,
        causes: [],
        effects: ["suspendedUntil=0"],
        suspended: false
      });
    }
  }

  // decisión TOR
  let action: TorEvent["action"] = "hash";
  const causes: string[] = [top.key];
  const effects: string[] = [
    `entropy=${entropy.toFixed(2)}`,
    `dominance=${dominance.toFixed(2)}`,
    `stuck=${stuckCount}`
  ];

  // tender al contrario:
  // - si alto dominio/repetición -> suelta (suspend)
  // - si baja entropía -> conserva (hold)
  if (lowEntropy) {
    action = "hold";
    effects.push("homeostasis=conserve");
  } else if (stuckCount >= 2 || (highDominance && hits.length >= 4)) {
    action = "suspend";
    const v = topics[top.key];
    if (v) {
      topics[top.key] = { ...v, suspendedUntil: now + suspendMs };
      effects.push(`suspendedUntil+=${suspendMs}ms`);

      // si hay segundo, lo “favorecemos” un poco sin inflarlo
      if (second?.key && topics[second.key]) {
        const vv = topics[second.key];
        topics[second.key] = { ...vv, w: Math.min(1, vv.w + 0.03), last: now };
        causes.push(second.key);
        effects.push("promote=second+0.03");
      }
    }
  } else {
    action = "hash";
    effects.push("homeostasis=neutral");
  }

  events.push({
    t: now,
    mode,
    action,
    token: borrowedTopToken || top.token || undefined,
    key: top.key,
    domain: top.domain,
    causes,
    effects,
    suspended: action === "suspend"
  });

  return {
    ...s,
    memory: {
      ...s.memory,
      topics,
      meta: {
        ...meta,
        events
      }
    }
  };
}

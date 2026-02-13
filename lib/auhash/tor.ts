// lib/auhash/tor.ts
import type { AUHashState, TorEvent } from "./kernel";
import type { MemoryHit } from "./minimal";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

type TorDecision = {
  pick: MemoryHit | null;
  anti: null | "silence" | "break";
  reason: string;
  effects: string[];
};

export function applyTor(
  state: AUHashState,
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  borrowedToken?: string
): { state: AUHashState; decision: TorDecision } {
  const s = state;
  const now = Date.now();

  const meta = s.memory.meta;
  const topics = { ...s.memory.topics };

  const top = hits[0] || null;
  const second = hits[1] || null;

  // --- métricas simples
  const topW = top?.w ?? 0;
  const sumW = hits.slice(0, 6).reduce((acc, h) => acc + (h.w || 0), 0) || 1;
  const dominance = clamp01(topW / sumW);

  const lastPicked = meta.lastPickedKey;
  const sameAsLast = !!(top && lastPicked && top.key === lastPicked);

  // stuckCount: sube si repetimos top en alta dominancia
  let stuckCount = meta.stuckCount ?? 0;
  if (sameAsLast && dominance > 0.34) stuckCount += 1;
  else stuckCount = Math.max(0, stuckCount - 1);

  // --- decisión base
  let pick: MemoryHit | null = top;
  let anti: TorDecision["anti"] = null;
  let reason = "base";
  const effects: string[] = [];

  // (1) si casi no hay material → silencio
  if (!top || topW < 0.10) {
    pick = null;
    anti = "silence";
    reason = "low_signal";
    effects.push("anti=silence");
  }

  // (2) si estamos atascados → rota al 2º (si existe y no está suspendido)
  if (!anti && stuckCount >= 2 && second && !second.suspended) {
    pick = second;
    reason = "rotate_second";
    effects.push("rotate=second");
  }

  // (3) homeostasis: si hay demasiada dominancia prolongada, “hold” top por un rato
  //     (no borra; suspende la competición)
  if (!anti && stuckCount >= 4 && top) {
    const holdMs = 90_000; // 90s (ajustable)
    const t = topics[top.key];
    if (t) {
      topics[top.key] = { ...t, suspendedUntil: Math.max(t.suspendedUntil || 0, now + holdMs) };
      effects.push(`hold=${top.key}`);
      reason = "hold_dominant";
      // tras hold, elige siguiente disponible
      const next = hits.find(h => h.key !== top.key && !h.suspended) || null;
      pick = next;
    }
  }

  // --- registrar evento TOR (solo lógica/cadena, NO respuesta)
  const ev: TorEvent = {
    t: now,
    mode,
    action: anti === "silence" ? "hold" : "hash",
    token: borrowedToken,
    key: pick?.key,
    domain: pick?.domain || "tema",
    causes: [
      top ? `top=${top.key}` : "top=none",
      `dominance=${dominance.toFixed(2)}`,
      `stuck=${stuckCount}`,
    ],
    effects: effects.length ? effects : ["none"],
    suspended: false,
  };

  const topHistory = Array.isArray(meta.topHistory) ? meta.topHistory : [];
  if (pick) {
    topHistory.push({ t: now, key: pick.key, token: pick.token, domain: pick.domain });
  }

  const newMeta = {
    ...meta,
    stuckCount,
    lastPickedKey: pick?.key ?? meta.lastPickedKey ?? null,
    topHistory: topHistory.slice(-40),
    events: [...(meta.events || []), ev].slice(-120),
  };

  const newState: AUHashState = {
    ...s,
    t: now,
    memory: {
      ...s.memory,
      topics,
      meta: newMeta,
    },
  };

  return {
    state: newState,
    decision: { pick, anti, reason, effects },
  };
}

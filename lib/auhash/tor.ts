// lib/auhash/tor.ts
import type { AUHashState, TorEvent } from "./kernel";
import type { MemoryHit } from "./minimal";

/* =========================================================
   Context coming from Frame (macro) => TOR (micro)
========================================================= */

export type FrameMetrics = {
  dimensional_distance?: number; // 0..1
  polarity_gap?: number;         // 0..1
  cycle_conflict?: number;       // 0..1
};

export type FrameOps = {
  entanglement?: number; // 0..1
  resonance?: number;    // 0..1
  curvature?: number;    // 0..1
  noise?: number;        // 0..1
  duality?: number;      // 0..1
};

/**
 * Macro-context modulation (city / GM-Goatchain / juramento / etc.)
 * - weight: cuánto pesa el contexto sobre el cálculo “frame-only”
 * - biasHold/biasSilence/biasRelease: 0..1
 * - forceRotate: si el contexto impone rotación
 */
export type TorMacro = {
  weight?: number;       // 0..1 (default 0.30)
  biasHold?: number;     // 0..1
  biasSilence?: number;  // 0..1
  biasRelease?: number;  // 0..1
  forceRotate?: boolean; // default false
  tag?: string;          // etiqueta opcional (p.ej. "city=jerusalem")
};

export type TorContext = {
  metrics?: FrameMetrics;
  ops?: FrameOps;
  tor?: TorMacro; // 👈 NUEVO
};

export type TorDecision = {
  anti?: null | "silence" | "break";
  forceRotate: boolean;
  biasHold: number;     // 0..1
  biasSilence: number;  // 0..1
  biasRelease: number;  // 0..1
  chosen: MemoryHit | null;
  reason: string;
};

/* =========================================================
   Helpers
========================================================= */

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function nowMs(): number {
  return Date.now();
}

function toFixed2(x: number): string {
  return (Math.round(x * 100) / 100).toFixed(2);
}

function safeDomain(hit: MemoryHit | null | undefined): string {
  return hit?.domain || "tema";
}

function safeToken(hit: MemoryHit | null | undefined, fallback?: string): string | undefined {
  return hit?.token || fallback;
}

function metricTags(ctx?: TorContext): { causes: string[]; effects: string[] } {
  const m = ctx?.metrics || {};
  const o = ctx?.ops || {};
  const t = ctx?.tor || {};

  const dd = clamp01(m.dimensional_distance ?? 0);
  const pg = clamp01(m.polarity_gap ?? 0);
  const cc = clamp01(m.cycle_conflict ?? 0);

  const ent = clamp01(o.entanglement ?? 0);
  const res = clamp01(o.resonance ?? 0);
  const curv = clamp01(o.curvature ?? 0);
  const noise = clamp01(o.noise ?? 0);
  const dual = clamp01(o.duality ?? 0);

  const tw = clamp01(t.weight ?? 0.30);
  const th = t.biasHold != null ? clamp01(t.biasHold) : null;
  const ts = t.biasSilence != null ? clamp01(t.biasSilence) : null;
  const tr = t.biasRelease != null ? clamp01(t.biasRelease) : null;
  const trot = !!t.forceRotate;

  return {
    causes: [
      `dd=${toFixed2(dd)}`,
      `pg=${toFixed2(pg)}`,
      `cc=${toFixed2(cc)}`,
      `dual=${toFixed2(dual)}`,
      `ctxW=${toFixed2(tw)}`,
      th == null ? "ctxH=na" : `ctxH=${toFixed2(th)}`,
      ts == null ? "ctxS=na" : `ctxS=${toFixed2(ts)}`,
      tr == null ? "ctxR=na" : `ctxR=${toFixed2(tr)}`,
      `ctxRot=${trot ? "1" : "0"}`,
      t.tag ? `ctxTag=${t.tag}` : "ctxTag=none",
    ],
    effects: [
      `ent=${toFixed2(ent)}`,
      `res=${toFixed2(res)}`,
      `curv=${toFixed2(curv)}`,
      `noise=${toFixed2(noise)}`,
      ctx?.tor ? "context_modulated" : "pure_tor",
    ],
  };
}

function mixBias(base: number, ctxValue: number | undefined, weight: number): number {
  if (ctxValue == null) return clamp01(base);
  return clamp01(base * (1 - weight) + clamp01(ctxValue) * weight);
}

/* =========================================================
   Decision (read-only)
========================================================= */

export function decideTor(
  state: AUHashState,
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  token?: string,
  ctx?: TorContext
): TorDecision {
  const m = ctx?.metrics || {};
  const o = ctx?.ops || {};
  const t = ctx?.tor || {};

  const dd = clamp01(m.dimensional_distance ?? 0);
  const pg = clamp01(m.polarity_gap ?? 0);
  const cc = clamp01(m.cycle_conflict ?? 0);

  const ent = clamp01(o.entanglement ?? 0);
  const res = clamp01(o.resonance ?? 0);
  const curv = clamp01(o.curvature ?? 0);
  const noise = clamp01(o.noise ?? 0);

  // Biases (frame-only)
  const baseHold = clamp01(Math.max(pg, cc * 0.75)); // proteger
  const baseSilence = clamp01(Math.max(dd, noise * 0.8)); // no decidir en falso
  const baseRelease = clamp01(
    Math.max(0, (ent * 0.55 + res * 0.45) - baseHold * 0.35)
  ); // despegar si hay coherencia

  const baseRotate = cc > 0.65 || curv > 0.70;

  // Context modulation
  const w = clamp01(t.weight ?? 0.30);
  const biasHold = mixBias(baseHold, t.biasHold, w);
  const biasSilence = mixBias(baseSilence, t.biasSilence, w);
  const biasRelease = mixBias(baseRelease, t.biasRelease, w);
  const forceRotate = !!(baseRotate || t.forceRotate);

  const chosen = hits.length ? hits[0] : null;

  // Dominance proxy (si no existe strength, usa w)
  const strength = clamp01((chosen as any)?.strength ?? (chosen?.w ?? 0));

  // stuck proxy: si repite lastPickedKey
  const lastPickedKey = state.memory?.meta?.lastPickedKey || null;
  const sameAsLast = !!(lastPickedKey && chosen?.key && lastPickedKey === chosen.key);
  const stuckCount = state.memory?.meta?.stuckCount || 0;
  const stuckHard = sameAsLast && stuckCount >= 2;

  // Anti selection
  let anti: TorDecision["anti"] = null;
  let reason = "neutral";

  if (!chosen) {
    anti = "silence";
    reason = "no_hits";
  } else if (biasSilence > 0.62) {
    anti = "silence";
    reason = `biasSilence=${toFixed2(biasSilence)}`;
  } else if (forceRotate) {
    anti = null;
    reason = `forceRotate cc/curv/ctx`;
  } else if (stuckHard) {
    anti = null;
    reason = `stuckCount=${stuckCount}`;
  } else if (strength > 0.70 && biasHold > 0.45) {
    anti = null;
    reason = `strong+hold strength=${toFixed2(strength)} hold=${toFixed2(biasHold)}`;
  } else {
    anti = null;
    reason = `ok release=${toFixed2(biasRelease)} hold=${toFixed2(biasHold)}`;
  }

  // En modo espejo, tolera un poco más de “silence” (siempre que no haya conflicto)
  if (mode === "hwancko" && anti === "silence" && cc < 0.45 && biasSilence < 0.75) {
    reason += " (mirror-soft)";
  }

  return {
    anti,
    forceRotate: !!(forceRotate || stuckHard),
    biasHold,
    biasSilence,
    biasRelease,
    chosen,
    reason,
  };
}

/* =========================================================
   Apply TOR (writes into state, records TorEvent)
   - No borra: suspende/activa/hold/release
========================================================= */

export function applyTor(
  state: AUHashState,
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  token?: string,
  ctx?: TorContext & {
    dominanceBias?: number;
    silenceBias?: number;
  }
): AUHashState {
  if (!hits?.length) return state;

  const decision = decideTor(state, mode, hits, token, ctx);
  const chosen = decision.chosen;
  if (!chosen?.key) return state;

  const s: AUHashState = { ...state };
  const memory = { ...s.memory };
  const topics = { ...memory.topics };
  const meta = { ...memory.meta };

  // ensure arrays
  meta.events = Array.isArray(meta.events) ? meta.events : [];
  meta.topHistory = Array.isArray(meta.topHistory) ? meta.topHistory : [];

  // stuck tracking
  if (meta.lastPickedKey === chosen.key) meta.stuckCount = (meta.stuckCount || 0) + 1;
  else meta.stuckCount = 0;

  meta.lastPickedKey = chosen.key;
  meta.topHistory.push({
    t: nowMs(),
    key: chosen.key,
    token: chosen.token,
    domain: chosen.domain,
  });

  // Ensure topic exists
  const t0 = topics[chosen.key];
  if (!t0) {
    memory.meta = meta;
    s.memory = memory;
    return s;
  }

  const now = nowMs();

  // Timings (ms) — ajustables sin romper
  const HOLD_MS = 6_000;
  const ROTATE_MS = 9_000;

  // Decide action
  let action: TorEvent["action"] = "hash";
  let suspended = false;

  if (decision.anti === "silence") {
    action = "suspend";
    suspended = true;
    topics[chosen.key] = {
      ...t0,
      suspendedUntil: Math.max(t0.suspendedUntil || 0, now + HOLD_MS),
      last: now,
    };
  } else if (decision.forceRotate) {
    action = "suspend";
    suspended = true;
    topics[chosen.key] = {
      ...t0,
      suspendedUntil: Math.max(t0.suspendedUntil || 0, now + ROTATE_MS),
      last: now,
    };
  } else if (decision.biasHold > 0.58) {
    action = "hold";
    const dominate = clamp01((chosen as any)?.strength ?? (chosen.w ?? 0));
    if (dominate > 0.72) {
      suspended = true;
      topics[chosen.key] = {
        ...t0,
        suspendedUntil: Math.max(t0.suspendedUntil || 0, now + HOLD_MS),
        last: now,
      };
    } else {
      topics[chosen.key] = { ...t0, last: now };
    }
  } else if (decision.biasRelease > 0.62) {
    action = "release";
    const newW = clamp01((t0.w ?? 0) * 0.88);
    topics[chosen.key] = {
      ...t0,
      w: newW,
      last: now,
      suspendedUntil: 0,
    };
  } else {
    action = "hash";
    const bump = mode === "wancko" ? 0.03 : 0.02;
    const newW = clamp01((t0.w ?? 0) + bump);
    topics[chosen.key] = {
      ...t0,
      w: newW,
      last: now,
    };
  }

  // TOR event with full causal payload
  const tags = metricTags(ctx);

  const ev: TorEvent = {
    t: now,
    timestamp: now, // ✅ mantengo ambos porque tu kernel los requiere
    mode,
    action,
    token: safeToken(chosen, token),
    key: chosen.key,
    domain: safeDomain(chosen),
    causes: tags.causes,
    effects: [
      ...tags.effects,
      `anti=${decision.anti ?? "none"}`,
      `hold=${toFixed2(decision.biasHold)}`,
      `sil=${toFixed2(decision.biasSilence)}`,
      `rel=${toFixed2(decision.biasRelease)}`,
      `rotate=${decision.forceRotate ? "1" : "0"}`,
      `reason=${decision.reason.replace(/\s+/g, "_")}`,
    ],
    suspended,
  };

  meta.events.push(ev);

  memory.topics = topics;
  memory.meta = meta;
  s.memory = memory;

  return s;
}

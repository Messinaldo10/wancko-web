// lib/auhash/tor.ts
import type { AUHashState } from "./kernel";
import type { MemoryHit } from "./minimal";

/* =========================================================
   CONTEXTO ENTROPICO (opcional)
========================================================= */

type FrameMetrics = {
  dimensional_distance?: number; // 0..1
  polarity_gap?: number;         // 0..1
  cycle_conflict?: number;       // 0..1
};

type FrameOps = {
  entanglement?: number; // 0..1
  resonance?: number;    // 0..1
  curvature?: number;    // 0..1
  noise?: number;        // 0..1
  duality?: number;      // 0..1
};

type TorContext = {
  metrics?: FrameMetrics;
  ops?: FrameOps;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* =========================================================
   APPLY TOR
========================================================= */

export function applyTor(
  state: AUHashState,
  mode: "wancko" | "hwancko",
  hits: MemoryHit[],
  token?: string,
  ctx?: TorContext
): AUHashState {

  if (!hits.length) return state;

  const s = { ...state };
  const memory = { ...s.memory };
  const topics = { ...memory.topics };
  const meta = { ...memory.meta };

  /* ===============================
     1️⃣ FRAME BIASES
  =============================== */

  const m = ctx?.metrics || {};
  const o = ctx?.ops || {};

  const dd = clamp01(m.dimensional_distance ?? 0);
  const pg = clamp01(m.polarity_gap ?? 0);
  const cc = clamp01(m.cycle_conflict ?? 0);

  const ent = clamp01(o.entanglement ?? 0);
  const res = clamp01(o.resonance ?? 0);
  const curv = clamp01(o.curvature ?? 0);
  const noise = clamp01(o.noise ?? 0);
  const dual = clamp01(o.duality ?? 0);

  // Protección estructural
  const biasHold = clamp01(Math.max(pg, cc * 0.8, dual * 0.6));

  // Pausa estratégica
  const biasSilence = clamp01(Math.max(dd, noise * 0.9));

  // Apertura controlada
  const biasRelease = clamp01(
    Math.max(0, ent * 0.55 + res * 0.45 - biasHold * 0.4)
  );

  const forceRotate = cc > 0.65 || curv > 0.70;

  /* ===============================
     2️⃣ PICK
  =============================== */

  const top = hits[0];
  const second = hits[1] || null;

  const chosen = forceRotate && second ? second : top;
  const dominance = clamp01(chosen.strength ?? 0);

  /* ===============================
     3️⃣ STUCK DETECTION
  =============================== */

  meta.stuckCount = meta.stuckCount || 0;

  if (meta.lastPickedKey === chosen.key) {
    meta.stuckCount += 1;
  } else {
    meta.stuckCount = 0;
  }

  meta.lastPickedKey = chosen.key;

  const repetitionPressure = clamp01(meta.stuckCount / 4);

  /* ===============================
     4️⃣ SUSPENSION / HOLD
  =============================== */

  const suspendThreshold =
    0.60 - biasHold * 0.15 - repetitionPressure * 0.10;

  if (dominance > suspendThreshold || meta.stuckCount > 2) {
    const t = topics[chosen.key];
    if (t) {
      topics[chosen.key] = {
        ...t,
        suspendedUntil:
          Date.now() + 3000 + biasHold * 4000 + repetitionPressure * 3000
      };
    }
  }

  /* ===============================
     5️⃣ RELEASE (desbloqueo)
  =============================== */

  if (biasRelease > 0.6 && topics[chosen.key]) {
    topics[chosen.key] = {
      ...topics[chosen.key],
      suspendedUntil: Date.now() - 1
    };
  }

  /* ===============================
     6️⃣ ANTI (SILENCE)
  =============================== */

  let anti: null | "silence" | "break" = null;

  if (biasSilence > 0.72) {
    anti = "silence";
  }

  /* ===============================
     7️⃣ LOG EVENT
  =============================== */

const now = Date.now();

memory.meta.events.push({
  t: now,
  timestamp: now,
  mode,
  action:
    anti === "silence"
      ? "suspend"
      : biasRelease > 0.6
      ? "release"
      : biasHold > 0.6
      ? "hold"
      : "hash",
  token,
  key: chosen.key,
  domain: chosen.domain,
  causes: [
    `dd:${dd.toFixed(2)}`,
    `pg:${pg.toFixed(2)}`,
    `cc:${cc.toFixed(2)}`
  ],
  effects: [
    `ent:${ent.toFixed(2)}`,
    `res:${res.toFixed(2)}`,
    `noise:${noise.toFixed(2)}`
  ],
  suspended: anti === "silence"
});

  /* ===============================
     8️⃣ UPDATE MEMORY
  =============================== */

  memory.topics = topics;
  memory.meta = meta;

  return {
    ...s,
    memory
  };
}

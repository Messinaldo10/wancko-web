// lib/auhash/minimal.js
// AU_HASH Kernel — JavaScript version (no TypeScript)
// Pure functions. No UI. No routes.

export function extractGlyphs(text, lang = "auto") {
  const t = Date.now();
  const norm = normalizeText(text);
  const sig = basicSignals(norm);
  const domains = inferDomains(norm);
  const chunks = extractChunks(norm);

  const glyphs = [];

  for (const d of domains) {
    glyphs.push({
      id: makeId(d, chunks.key),
      domain: d,
      w: 0.55,
      p: inferPolarity(norm, d),
      sig,
      t
    });
  }

  if (chunks.entity) {
    glyphs.push({
      id: makeId("ENTITY", chunks.entity),
      domain: "ENTITY",
      w: 0.6,
      p: inferPolarity(norm, "ENTITY"),
      sig,
      t
    });
  }

  if (chunks.place) {
    glyphs.push({
      id: makeId("PLACE", chunks.place),
      domain: "PLACE",
      w: 0.66,
      p: inferPolarity(norm, "PLACE"),
      sig,
      t
    });
  }

  return dedupeGlyphs(glyphs);
}

export function updateAUHash(prev, glyphs, role) {
  const now = Date.now();
  const base = prev && prev.v === 1
    ? prev
    : { v: 1, ent: 0, beau: 0.5, mem: {}, seed: 17, t: now };

  const entAdd = glyphs.length * (role === "user" ? 1.2 : 0.6);
  const ent = base.ent + entAdd;

  const beau = clamp01(
    base.beau +
    beautyDelta(glyphs, role) -
    loopPenalty(base.mem, glyphs)
  );

  const mem = { ...base.mem };

  for (const g of glyphs) {
    const k = g.domain;
    const arr = Array.isArray(mem[k]) ? mem[k].slice() : [];

    let w = clamp01(g.w + 0.1 + (g.sig.q ? 0.06 : 0.03));
    if (g.p === 1) w = clamp01(w + 0.05);
    if (g.p === -1) w = clamp01(w - 0.05);

    const gg = { ...g, w };
    mem[k] = [gg, ...arr].slice(0, 8);
  }

  const seed = evolveSeed(base.seed, glyphs);
  return { v: 1, ent, beau, mem, seed, t: now };
}

export function resolveQuery(text) {
  const norm = normalizeText(text);
  const q = basicSignals(norm).q === 1;

  const wantsRetrieve =
    q &&
    /\b(antes|abans|before|dije|he dit|said|record|remember)\b/.test(norm);

  if (/\b(donde|on|where)\b/.test(norm)) return { domain: "PLACE", wantsRetrieve };
  if (/\b(quien|qui|who)\b/.test(norm)) return { domain: "ENTITY", wantsRetrieve };
  if (/\b(cuando|quan|when)\b/.test(norm)) return { domain: "TIME", wantsRetrieve };

  return { domain: q ? "UNKNOWN" : "INTENT", wantsRetrieve };
}

export function retrieve(hash, domain) {
  if (!hash || !hash.mem) return null;
  const arr = hash.mem[domain];
  if (!Array.isArray(arr) || arr.length === 0) return null;

  return arr.reduce((a, b) => (b.w > a.w ? b : a), arr[0]);
}

/* ---------------- helpers ---------------- */

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function basicSignals(norm) {
  const len = norm.length;
  const l = len < 18 ? 0 : len < 40 ? 1 : len < 90 ? 2 : 3;
  const q = /[?¿]|\b(que|qué|quin|which|what|donde|on|where)\b/.test(norm) ? 1 : 0;
  const n = /\b(no|not|mai|nunca)\b/.test(norm) ? 1 : 0;
  return { l, q, n };
}

function inferDomains(norm) {
  const out = [];
  if (/\b(donde|on|where)\b/.test(norm)) out.push("PLACE");
  if (/\b(hoy|avui|today|cuando|quan|when)\b/.test(norm)) out.push("TIME");
  if (/\b(entre|between|opcion|opcio|choose)\b/.test(norm)) out.push("CHOICE");
  out.push("INTENT");
  return [...new Set(out)];
}

function extractChunks(norm) {
  const key = norm.slice(0, 24);
  const quoted = norm.match(/"([^"]+)"/)?.[1] || null;
  const place =
    norm.match(/\b(en|a|al|to)\s+([a-z0-9\s]{3,40})$/)?.[2] || null;
  return { key, entity: quoted, place };
}

function inferPolarity(norm) {
  if (/\b(no|not|mai|nunca)\b/.test(norm)) return -1;
  if (!/[?¿]/.test(norm)) return 1;
  return 0;
}

function makeId(domain, key) {
  const raw = `${domain}:${key}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${domain}_${(h >>> 0).toString(16)}`;
}

function dedupeGlyphs(glyphs) {
  const seen = new Set();
  return glyphs.filter(g => {
    const k = g.domain + g.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function beautyDelta(glyphs, role) {
  let d = role === "user" ? 0.02 : 0.01;
  for (const g of glyphs) {
    if (g.sig.q) d += 0.01;
    if (g.sig.n) d -= 0.012;
  }
  return d;
}

function loopPenalty(mem, glyphs) {
  let pen = 0;
  for (const g of glyphs) {
    const arr = mem[g.domain];
    if (!arr || arr.length < 2) continue;
    if (arr.slice(0, 3).filter(x => x.id === g.id).length >= 2) pen += 0.015;
  }
  return pen;
}

function evolveSeed(seed, glyphs) {
  let s = seed;
  for (const g of glyphs) {
    const tail = g.id.slice(-6);
    for (let i = 0; i < tail.length; i++) {
      s = (s * 33) ^ tail.charCodeAt(i);
      s >>>= 0;
    }
  }
  return s >>> 0;
}

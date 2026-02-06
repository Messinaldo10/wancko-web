// minimal.js
import { detectLang } from "./kernel.js";

const ALIASES_MIN = [
  { re: /\b(playa|platja|beach)\b/i, domain: "LUGAR", glyph: "LUGAR.PLAYA", v: { es: "playa", ca: "platja", en: "beach" } },
  { re: /\b(monta(ñ|n)a|muntanya|mountain)\b/i, domain: "LUGAR", glyph: "LUGAR.MONTANA", v: { es: "montaña", ca: "muntanya", en: "mountain" } },
  { re: /\b(cabra|goat)\b/i, domain: "ANIMAL", glyph: "ANIMAL.CABRA", v: { es: "cabra", ca: "cabra", en: "goat" } },
  { re: /\b(barcelona)\b/i, domain: "CIUDAD", glyph: "CIUDAD.BARCELONA", v: { es: "Barcelona", ca: "Barcelona", en: "Barcelona" } },
];

export function extractGlyphsMin(text, lang) {
  const L = lang || detectLang(text);
  const t = String(text || "");
  const out = [];
  for (const a of ALIASES_MIN) {
    if (a.re.test(t)) {
      out.push({ domain: a.domain, glyph: a.glyph, value: a.v[L] || a.v.en });
    }
  }
  return out;
}

export function updateMemoryMin(prevMemory, glyphs) {
  const mem = prevMemory && typeof prevMemory === "object" ? { ...prevMemory } : {};
  for (const g of glyphs || []) {
    mem[g.domain] = { glyph: g.glyph, value: g.value, t: Date.now() };
  }
  return mem;
}

export function retrieveMin(memory, domain) {
  const m = memory?.[domain];
  if (!m) return null;
  return m.value || m.glyph;
}

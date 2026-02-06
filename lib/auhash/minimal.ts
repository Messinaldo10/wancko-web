/* ============================================================
 * AU_HASH minimal — v1 (TS)
 * Wrapper mínimo para usar kernel en routes sin mezclar UI.
 * ============================================================ */

import type { AUHashState, Lang, Role, Glyph } from "./kernel";
import { extractGlyphs, updateAUHash, retrieve, hashAU } from "./kernel";

export type MemoryPack = {
  state: AUHashState;
  glyphs: Glyph[];
  langGuess: Lang;
};

export function ensureState(prev: any, langFallback: Lang = "es"): AUHashState {
  if (prev && prev.v === 1 && prev.store) {
    return {
      ...prev,
      lang: (prev.lang as Lang) || langFallback,
      features: prev.features || { entropy: 0.15, beauty: 0.15, tension: 0.10 }
    } as AUHashState;
  }
  const t = Date.now();
  return {
    v: 1,
    t0: t,
    tLast: t,
    lang: langFallback,
    store: {},
    features: { entropy: 0.15, beauty: 0.15, tension: 0.10 }
  };
}

export function ingestText(prev: AUHashState | null, text: string, role: Role, langHint?: Lang): MemoryPack {
  const { langGuess, glyphs } = extractGlyphs(text, langHint);
  const state0 = ensureState(prev, langGuess);

  // El idioma de sesión NO lo cambia el kernel: lo decide la route.
  // Aquí solo actualizamos el estado con glifos.
  const next = updateAUHash(state0, glyphs, role);

  return { state: next, glyphs, langGuess };
}

export function queryMemory(state: AUHashState, text: string) {
  return retrieve(state, text);
}

// pequeño helper: IDs estables sin hardcode
export function auId(label: string) {
  return hashAU(label);
}

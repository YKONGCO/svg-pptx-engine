// Glyph-width estimation for text and formula runs.
//
// PowerPoint's text renderer and our OMML-injection path both need
// to know how wide a run of glyphs will be on screen without
// having a real font shaper at hand. The estimator below uses a
// fixed table of glyph class → em-fraction width, the same
// heuristic the SVG text converter uses (`src/svg/converters/text.ts`).
//
// This is *not* a real font metric — for letter-perfect alignment
// across CJK / Latin / symbol fonts you need a font-shaper
// pipeline (e.g. opentype.js). The estimator is good enough for
// the formula-box sizing done in `src/pptx/utils/formula.ts` and
// the inline-flow work in Phase 1.

/** Estimate the pixel width of a run of text rendered at
 *  `fontSize` px. `letterSpacing` (px) is added between glyphs. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacing: number = 0): number {
  let width = 0

  for (const char of text) {
    if (char === ' ') {
      width += fontSize * 0.4
    } else if (/[一-鿿㐀-䶿぀-ヿ가-힯]/.test(char)) {
      width += fontSize * 1.28
    } else if (/[A-Z0-9]/.test(char)) {
      width += fontSize * 0.78
    } else {
      width += fontSize * 0.7
    }
  }

  if (text.length > 1 && letterSpacing) {
    width += letterSpacing * (text.length - 1)
  }

  return Math.max(width + fontSize * 0.9, fontSize * 1.8)
}

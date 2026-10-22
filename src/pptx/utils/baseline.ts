// Phase 1: baseline-magic constants. Centralised so that the various
// formula / text / text-on-path emitters share the same model of
// "where is the baseline?" and "how do I nudge a formula box to
// align with surrounding text?".
//
// The values are still magic numbers (ROADMAP §"opentype.js 是否引入"
// — user opted NOT to bring in a real font-metrics library). They
// represent the behaviour of the engine's `estimateTextWidth`
// heuristic plus the empirical observations baked into
// `DEFAULT_FORMULA_NUDGE` over the v1.x line. The interface is
// designed so a future `setFontMetricsProvider(...)` can replace
// the constants wholesale without changing the consumers.

/**
 * Phase 1 baseline kit. All ratios are in the [0, 1.5] range and
 * express the location of a typographic landmark (ascent, x-height,
 * baseline) as a fraction of the font size. The PPTX layer reads
 * these when:
 *
 *   - text frames are vertically aligned to a known anchor
 *     (baseline / cap-height / x-height) — see BASELINE_FALLBACK.
 *   - inline formulas are nudged so the formula's glyph baseline
 *     matches the surrounding text's baseline.
 *   - a run-level sub/superscript is placed; the size and y-shift
 *     are derived from SUB_RATIO / SUP_RATIO / SUB_SHIFT_RATIO.
 *   - a block-level formula ($$...$$ / \[...\]) is centred on its
 *     own line; the line padding is BLOCK_PADDING_RATIO em.
 */
export const BASELINE = {
  /** Plain-text ascent: cap height of the run's font. */
  TEXT_ASCENT_RATIO: 0.8,
  /** Fallback text descent: below-baseline ink depth. */
  TEXT_DESCENT_RATIO: 0.2,
  /** Formula ascent: OMML's effective cap-height within the box. */
  FORMULA_ASCENT_RATIO: 0.95,
  /** Formula descent: below-baseline ink depth (fractions, sub, …). */
  FORMULA_DESCENT_RATIO: 0.62,
  /**
   * Per-pixel nudge on the formula box's top-left (in em units)
   * applied after the baseline-aware offset. Positive = down/right.
   * Mirrors the v1.x `DEFAULT_FORMULA_NUDGE` values, but expressed
   * in em so they survive font-size changes.
   */
  FORMULA_X_NUDGE_EM: -0.14,
  FORMULA_Y_NUDGE_EM: -0.025,
  /** Line-height used for text-only rows. */
  LINE_HEIGHT_RATIO: 1.45,
  /** Block-level formulas: extra padding (em) above and below. */
  BLOCK_PADDING_EM: 0.5,
  /** Run-level sub/superscript size relative to the base font. */
  SUB_RATIO: 0.7,
  SUP_RATIO: 0.7,
  /** Run-level sub/superscript y-shift relative to the base font. */
  SUB_SHIFT_RATIO: 0.3,
  SUP_SHIFT_RATIO: -0.3,
} as const

/**
 * Convenience: compute `ascent` and `descent` for a plain-text run
 * at the given font size. Matches the v1.x behaviour baked into
 * `src/svg/converters/text.ts:TEXT_ASCENT_RATIO` but kept in one
 * place so a real metrics provider can override it later.
 */
export function resolveTextBaseline(fontSizePx: number): { ascent: number; descent: number } {
  return {
    ascent: fontSizePx * BASELINE.TEXT_ASCENT_RATIO,
    descent: fontSizePx * BASELINE.TEXT_DESCENT_RATIO,
  }
}

/**
 * Convenience: formula run baseline at the given font size. The
 * formula's content rarely extends below ~0.62em in OMML, so we use
 * FORMULA_DESCENT_RATIO instead of TEXT_DESCENT_RATIO to avoid
 * creating a tail of whitespace below fractions.
 */
export function resolveFormulaBaseline(fontSizePx: number): { ascent: number; descent: number } {
  return {
    ascent: fontSizePx * BASELINE.FORMULA_ASCENT_RATIO,
    descent: fontSizePx * BASELINE.FORMULA_DESCENT_RATIO,
  }
}

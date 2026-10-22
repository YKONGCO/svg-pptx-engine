// Public API of the `src/formula/` module.
//
// The pipeline is:
//   LaTeX  →  MathNode AST  →  MathML string  →  OMML string
//
// The PPTX layer (`src/pptx/utils/formula.ts`) re-exports the
// conversion helpers from here and adds the PPTX-specific glue
// (per-text-element metrics, position nudging, PptxGenJS option
// construction, etc.).

export type { MathNode, MathTag, FormulaSource, InlineFormulaSegment } from './types'

// LaTeX → MathML
export { latexToMathML, mathNodeToMathML } from './latex'

// MathML model
export { parseMathML, flattenText, escapeXml } from './mathml'

// MathML → OMML
export { mathMLToOmml } from './omml'

// Formula boundary detection
export { extractFormulaSource, extractInlineFormulaSegments } from './extract'

// Color management
export {
  setFormulaColors,
  getFormulaColors,
  injectMathColors,
  injectUniformMathColor,
  normaliseHexColor,
  DEFAULT_FORMULA_COLORS,
  type FormulaColors
} from './colors'

// Glyph width estimation
export { estimateTextWidth } from './text-width'

// Data tables (exposed for tests and external tooling)
export {
  GREEK_MAP,
  OPERATOR_MAP,
  OPERATOR_NAMES,
  ACCENT_OVER,
  LINE_OVER,
  DOTS,
  MATRIX_ENVS,
  LEFT_RIGHT_DELIMS,
  TEXT_COMMANDS
} from './tables'

// MathNode — the unified AST used by the LaTeX / MathML / OMML pipeline.
//
// A node has a tag name (one of the MathML presentation tags), optional
// attributes, and either a `text` payload (leaf nodes like `<mi>x</mi>`)
// or a `children` list (branch nodes like `<mfrac>` or `<mrow>`).

export type MathTag =
  | 'math'
  | 'mrow'
  | 'mi'
  | 'mn'
  | 'mo'
  | 'mfrac'
  | 'msqrt'
  | 'msub'
  | 'msup'
  | 'msubsup'
  | 'mtext'
  | 'mover'
  | 'munder'
  | 'munderover'
  | 'mstyle'
  | 'mfenced'
  | 'mpadded'
  | 'none'
  | 'mtable'
  | 'mtr'
  | 'mtd'
  | 'menclose'
  | 'mspace'
  | 'mglyph'

export interface MathNode {
  name: MathTag
  attrs?: Record<string, string>
  text?: string
  children?: MathNode[]
}

/** A formula input the pipeline understands. The PPTX layer accepts
 *  either LaTeX or raw MathML and decides which stage of the
 *  pipeline to run. */
export interface FormulaSource {
  format: 'latex' | 'mathml'
  source: string
}

/** A single piece of a `<text>` string that has been sliced into
 *  plain-text runs and formula runs by the inline segmenter. */
export interface InlineFormulaSegment {
  type: 'text' | 'formula'
  source: string
  displayText: string
}

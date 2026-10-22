// LaTeX → MathML pipeline.
//
// `latexToMathML(latex)` is the only public entry point. Internally
// it runs a hand-written recursive-descent parser (`LatexParser`)
// that produces a `MathNode` AST, then serialises that AST to a
// MathML string via `mathNodeToMathML`.
//
// Why hand-rolled? The LaTeX subset we need is small (fractions,
// scripts, sqrt, accents, matrix-family environments, common
// functions/symbols) and the formatting conventions are stable.
// A full TeX engine would pull in a 5MB+ dependency for a fraction
// of its capabilities.

import type { MathNode } from './types'
import { escapeXml } from './mathml'
import {
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

function isDigit(char: string | undefined): boolean {
  return !!char && /[0-9]/.test(char)
}

function isLetter(char: string | undefined): boolean {
  return !!char && /[A-Za-z]/.test(char)
}

function isOperatorChar(char: string | undefined): boolean {
  return !!char && /[+\-*/=<>()[\],.:|]/.test(char)
}

function createRow(children: MathNode[]): MathNode {
  if (children.length === 1) {
    return children[0]
  }
  return { name: 'mrow', children }
}

function wrapScript(base: MathNode, sub?: MathNode, sup?: MathNode): MathNode {
  if (sub && sup) {
    return { name: 'msubsup', children: [base, sub, sup] }
  }
  if (sub) {
    return { name: 'msub', children: [base, sub] }
  }
  if (sup) {
    return { name: 'msup', children: [base, sup] }
  }
  return base
}

class LatexParser {
  private readonly input: string
  private pos = 0

  constructor(input: string) {
    this.input = input
  }

  parse(): MathNode {
    const expression = this.parseExpression()
    return { name: 'math', children: [expression] }
  }

  private parseExpression(stopChar?: string): MathNode {
    const children: MathNode[] = []

    while (!this.eof()) {
      this.skipWhitespace()

      if (stopChar && this.peek() === stopChar) {
        break
      }

      if (this.eof()) {
        break
      }

      const atom = this.parseAtom()
      if (!atom) {
        break
      }
      children.push(this.parseScripts(atom))
    }

    return createRow(children)
  }

  private parseAtom(): MathNode | null {
    const char = this.peek()

    if (!char) return null

    if (char === '{') {
      this.pos++
      const node = this.parseExpression('}')
      if (this.peek() === '}') this.pos++
      return node
    }

    if (char === '\\') {
      return this.parseCommand()
    }

    if (isDigit(char)) {
      let value = ''
      while (!this.eof() && /[0-9.]/.test(this.peek() || '')) {
        value += this.consume()
      }
      return { name: 'mn', text: value }
    }

    if (isLetter(char)) {
      let value = ''
      while (!this.eof() && isLetter(this.peek())) {
        value += this.consume()
      }
      return { name: 'mi', text: value }
    }

    if (isOperatorChar(char)) {
      this.pos++
      return { name: 'mo', text: char }
    }

    this.pos++
    return { name: 'mo', text: char }
  }

  private parseCommand(): MathNode {
    this.pos++
    const name = this.readCommandName()

    if (!name) {
      return { name: 'mo', text: '\\' }
    }

    if (name === 'frac') {
      const numerator = this.parseRequiredArgument()
      const denominator = this.parseRequiredArgument()
      return { name: 'mfrac', children: [numerator, denominator] }
    }

    if (name === 'binom' || name === 'dbinom' || name === 'tbinom') {
      // Binomial coefficient. MathML has no dedicated element for
      // it, so we emit a `linethickness="0"` fraction. The
      // mathml2omml fork recognises that and renders it as a
      // bar-less `<m:f>` — the standard way to typeset
      // ⁿCᵣ / (n choose k).
      const top = this.parseRequiredArgument()
      const bottom = this.parseRequiredArgument()
      return {
        name: 'mfrac',
        attrs: { linethickness: '0' },
        children: [top, bottom]
      }
    }

    if (name === 'begin') {
      return this.parseEnvironment()
    }

    if (name === 'sqrt') {
      if (this.peek() === '[') {
        this.skipBracketGroup('[', ']')
      }
      return { name: 'msqrt', children: [this.parseRequiredArgument()] }
    }

    if (TEXT_COMMANDS.has(name)) {
      return { name: 'mtext', text: this.readArgumentText() }
    }

    if (name === 'left' || name === 'right') {
      const delimiter = this.readDelimiter()
      const resolved = LEFT_RIGHT_DELIMS[delimiter] ?? delimiter
      // `fence="true"` and `stretchy="true"` together tell both
      // mathml2omml and PowerPoint that this is one half of a
      // matched pair that should be sized to fit its contents.
      return {
        name: 'mo',
        text: resolved,
        attrs: { fence: 'true', stretchy: 'true' }
      }
    }

    // `\{` and `\}` are the LaTeX escapes for the literal brace
    // characters. readCommandName reads them as the single-char
    // names `{` and `}` respectively, so we emit them as MathML
    // operator text directly. The OMML `fence="true"` lets the
    // renderer draw them at the right size when they're paired
    // (e.g. set-builder notation `{x \mid x ∈ A}`).
    if (name === '{') {
      return { name: 'mo', text: '{', attrs: { fence: 'true', stretchy: 'true' } }
    }
    if (name === '}') {
      return { name: 'mo', text: '}', attrs: { fence: 'true', stretchy: 'true' } }
    }

    if (name === 'overline' || name === 'underline') {
      const arg = this.parseRequiredArgument()
      const accent = LINE_OVER[name]
      return {
        name: name === 'overline' ? 'mover' : 'munder',
        attrs: { accent: 'false' },
        children: [
          arg,
          { name: 'mo', text: accent, attrs: { stretchy: 'true' } }
        ]
      }
    }

    if (ACCENT_OVER[name]) {
      const arg = this.parseRequiredArgument()
      return {
        name: 'mover',
        attrs: { accent: 'true' },
        children: [
          arg,
          { name: 'mo', text: ACCENT_OVER[name], attrs: { stretchy: 'true' } }
        ]
      }
    }

    if (DOTS[name]) {
      return { name: 'mo', text: DOTS[name] }
    }

    if (OPERATOR_NAMES.has(name)) {
      // Upright function name. `mathvariant="normal"` is the
      // MathML attribute that asks for upright (non-italic) glyph
      // rendering, which matches the LaTeX convention.
      return {
        name: 'mi',
        text: name,
        attrs: { mathvariant: 'normal' }
      }
    }

    if (GREEK_MAP[name]) {
      return { name: 'mi', text: GREEK_MAP[name] }
    }

    if (OPERATOR_MAP[name]) {
      return { name: 'mo', text: OPERATOR_MAP[name] }
    }

    return { name: 'mi', text: name }
  }

  private parseScripts(base: MathNode): MathNode {
    let sub: MathNode | undefined
    let sup: MathNode | undefined

    while (!this.eof()) {
      this.skipWhitespace()
      const next = this.peek()

      if (next === '^') {
        this.pos++
        sup = this.parseScriptArgument()
        continue
      }

      if (next === '_') {
        this.pos++
        sub = this.parseScriptArgument()
        continue
      }

      break
    }

    return wrapScript(base, sub, sup)
  }

  private parseScriptArgument(): MathNode {
    this.skipWhitespace()
    const atom = this.parseAtom()
    return atom ? this.parseScripts(atom) : { name: 'mi', text: '' }
  }

  private parseRequiredArgument(): MathNode {
    this.skipWhitespace()
    const atom = this.parseAtom()
    return atom ?? { name: 'mi', text: '' }
  }

  private readArgumentText(): string {
    this.skipWhitespace()
    if (this.peek() === '{') {
      this.pos++
      let depth = 1
      let value = ''
      while (!this.eof() && depth > 0) {
        const char = this.consume()
        if (char === '{') {
          depth++
          value += char
        } else if (char === '}') {
          depth--
          if (depth > 0) value += char
        } else {
          value += char
        }
      }
      return value
    }
    return this.consume() || ''
  }

  /** Read the `\begin{X}…\end{X}` environment name, the body, and
   *  the matching `\end`. Returns a MathML node that wraps the
   *  body in either `<mtable>` (for matrix-family environments)
   *  or falls back to a plain `<mrow>` (for unknown / unhandled
   *  environments — we still skip past the `\end{X}` so the
   *  outer parse doesn't trip on the leftover braces). */
  private parseEnvironment(): MathNode {
    const envName = this.readBracedGroup().trim()
    let depth = 1
    let body = ''
    while (!this.eof() && depth > 0) {
      const ch = this.peek()
      if (ch === '\\') {
        if (this.input[this.pos + 1] === '\\') {
          body += '\\\\'
          this.pos += 2
          continue
        }
        this.pos++
        const cmd = this.readCommandName()
        if (cmd === 'end' || cmd === 'begin') {
          const closeEnv = this.readBracedGroup().trim()
          if (cmd === 'end' && closeEnv === envName) {
            depth--
            if (depth === 0) {
              return this.renderEnvironment(envName, body)
            }
          } else if (cmd === 'begin') {
            depth++
          }
          body += `\\${cmd}{${closeEnv}}`
        } else {
          body += `\\${cmd}`
        }
      } else {
        body += ch ?? ''
        this.pos++
      }
    }
    return { name: 'mrow', children: [] }
  }

  private readBracedGroup(): string {
    this.skipWhitespace()
    if (this.peek() !== '{') {
      return this.consume() || ''
    }
    this.pos++
    const start = this.pos
    let depth = 1
    while (!this.eof() && depth > 0) {
      const ch = this.consume()
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return this.input.slice(start, this.pos - 1)
      }
    }
    return this.input.slice(start, this.pos)
  }

  private renderEnvironment(envName: string, body: string): MathNode {
    if (MATRIX_ENVS[envName] || envName === 'array' || envName === 'align' || envName === 'aligned' || envName === 'eqnarray') {
      const rows = this.splitMatrixBody(body)
      const mtableChildren: MathNode[] = rows.map((cells) => ({
        name: 'mtr',
        children: cells.map((cell) => ({
          name: 'mtd',
          children: this.latexToMathNodes(cell)
        }))
      }))
      const [open, close] = MATRIX_ENVS[envName] ?? ['', '']
      const children: MathNode[] = []
      if (open) {
        children.push({ name: 'mo', text: open, attrs: { stretchy: 'true', fence: 'true' } })
      }
      children.push({ name: 'mtable', children: mtableChildren })
      if (close) {
        children.push({ name: 'mo', text: close, attrs: { stretchy: 'true', fence: 'true' } })
      }
      return { name: 'mrow', children }
    }
    return { name: 'mrow', children: this.latexToMathNodes(body) }
  }

  private splitMatrixBody(body: string): string[][] {
    const rows: string[][] = []
    let depth = 0
    let row: string[] = []
    let cell = ''
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]
      if (ch === '{') { depth++; cell += ch; continue }
      if (ch === '}') { depth--; cell += ch; continue }
      if (depth === 0) {
        if (ch === '\\' && body[i + 1] === '\\') {
          row.push(cell)
          rows.push(row)
          row = []
          cell = ''
          i++
          continue
        }
        if (ch === '&') {
          row.push(cell)
          cell = ''
          continue
        }
      }
      cell += ch
    }
    if (cell.length > 0 || row.length > 0) {
      row.push(cell)
      rows.push(row)
    }
    return rows
  }

  private latexToMathNodes(fragment: string): MathNode[] {
    if (!fragment.trim()) return [{ name: 'mi', text: '' }]
    const root = new LatexParser(fragment).parse()
    if (root.children && root.children.length === 1) {
      return root.children
    }
    return root.children ?? []
  }

  private readDelimiter(): string {
    this.skipWhitespace()
    const char = this.peek()
    if (!char) return ''
    if (char === '\\') {
      this.pos++
      const name = this.readCommandName()
      if (name === '{' || name === '}' || name === '\\') {
        return `\\${name}`
      }
      return OPERATOR_MAP[name] || GREEK_MAP[name] || `\\${name}`
    }
    this.pos++
    return char
  }

  private skipBracketGroup(open: string, close: string): void {
    if (this.peek() !== open) return
    this.pos++
    let depth = 1
    while (!this.eof() && depth > 0) {
      const char = this.consume()
      if (char === open) depth++
      if (char === close) depth--
    }
  }

  private readCommandName(): string {
    const char = this.peek()
    if (char && !isLetter(char)) {
      this.pos++
      return char
    }

    let value = ''
    while (!this.eof() && isLetter(this.peek())) {
      value += this.consume()
    }
    return value
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek() || '')) {
      this.pos++
    }
  }

  private peek(): string | undefined {
    return this.input[this.pos]
  }

  private consume(): string | undefined {
    const value = this.input[this.pos]
    this.pos++
    return value
  }

  private eof(): boolean {
    return this.pos >= this.input.length
  }
}

/** Convert a `MathNode` tree back to a MathML string. The root
 *  `<math>` element is given the MathML namespace declaration. */
export function mathNodeToMathML(node: MathNode): string {
  const attrs = Object.entries(node.attrs ?? {})
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('')

  if (node.text !== undefined) {
    return `<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`
  }

  const children = (node.children ?? []).map(child => mathNodeToMathML(child)).join('')
  if (node.name === 'math') {
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${attrs}>${children}</math>`
  }
  return `<${node.name}${attrs}>${children}</${node.name}>`
}

/** Convert a LaTeX formula fragment to a MathML string. */
export function latexToMathML(latex: string): string {
  const parser = new LatexParser(latex)
  return mathNodeToMathML(parser.parse())
}

export const __testing = { LatexParser }

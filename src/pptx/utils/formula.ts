import type PptxGenJS from 'pptxgenjs'
import { XMLParser } from 'fast-xml-parser'
import { mml2omml } from 'mathml2omml'
import type { TextElement } from '../../sif/types/elements/text'
import type { Fill, GradientFill, SolidFill } from '../../sif/types/style/fill'
import { fontStyleToBool, fontWeightToBool, hexToPptxColor, pxToInch, pxToPt, textAlignToPptx } from '../utils'

type MathTag = 'math' | 'mrow' | 'mi' | 'mn' | 'mo' | 'mfrac' | 'msqrt' | 'msub' | 'msup' | 'msubsup' | 'mtext'

interface MathNode {
  name: MathTag
  attrs?: Record<string, string>
  text?: string
  children?: MathNode[]
}

export interface FormulaSource {
  format: 'latex' | 'mathml'
  source: string
}

export interface ConvertedFormula {
  type: 'formula'
  options: PptxGenJS.FormulaProps
}

export interface InlineFormulaSegment {
  type: 'text' | 'formula'
  source: string
  displayText: string
}

interface InlineLayoutMetrics {
  width: number
  fontSize: number
  y: number
  h: number
}

const GREEK_MAP: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Omega: 'Ω'
}

const OPERATOR_MAP: Record<string, string> = {
  cdot: '·',
  times: '×',
  pm: '±',
  mp: '∓',
  div: '÷',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  infty: '∞',
  sum: '∑',
  prod: '∏',
  int: '∫'
}

const TEXT_COMMANDS = new Set(['text', 'mathrm', 'operatorname'])

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function convertFillToColor(fill: Fill): string | undefined {
  if (fill.type === 'solid') {
    return hexToPptxColor((fill as SolidFill).color)
  }

  if (fill.type === 'gradient') {
    const gradient = (fill as GradientFill).gradient
    if (gradient.stops.length > 0) {
      return hexToPptxColor(gradient.stops[0].color)
    }
  }

  return undefined
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

function isDigit(char: string | undefined): boolean {
  return !!char && /[0-9]/.test(char)
}

function isLetter(char: string | undefined): boolean {
  return !!char && /[A-Za-z]/.test(char)
}

function isOperatorChar(char: string | undefined): boolean {
  return !!char && /[+\-*/=<>()[\],.:|]/.test(char)
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
      return { name: 'mo', text: delimiter, attrs: { fence: 'true' } }
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

  private readDelimiter(): string {
    this.skipWhitespace()
    const char = this.peek()
    if (!char) return ''
    if (char === '\\') {
      this.pos++
      const name = this.readCommandName()
      return OPERATOR_MAP[name] || GREEK_MAP[name] || name
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

function mathNodeToMathML(node: MathNode): string {
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

function latexToMathML(latex: string): string {
  const parser = new LatexParser(latex)
  return mathNodeToMathML(parser.parse())
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function toMathNodeList(input: unknown): MathNode[] {
  if (!Array.isArray(input)) return []

  const nodes: MathNode[] = []

  for (const entry of input as Array<Record<string, unknown>>) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === '#text') {
        const text = String(value ?? '')
        if (text.trim().length > 0) {
          nodes.push({ name: 'mtext', text })
        }
        continue
      }

      if (key === ':@') {
        continue
      }

      const childEntry = entry as Record<string, unknown>
      const attrs = (childEntry[':@'] ?? {}) as Record<string, string>
      const children = toMathNodeList(value)
      const node: MathNode = {
        name: key as MathTag,
        attrs,
        children
      }

      if (children.length === 1 && children[0].name === 'mtext' && !children[0].children?.length) {
        node.text = children[0].text
        node.children = undefined
      }

      nodes.push(node)
    }
  }

  return nodes
}

function parseMathML(mathml: string): MathNode {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    textNodeName: '#text'
  })
  const parsed = parser.parse(mathml)
  const nodes = toMathNodeList(parsed)
  const mathNode = nodes.find(node => node.name === 'math')
  if (!mathNode) {
    throw new Error('Invalid MathML: missing <math> root')
  }
  return mathNode
}

function flattenText(node: MathNode | undefined): string {
  if (!node) return ''
  if (node.text !== undefined) return node.text
  return (node.children ?? []).map(child => flattenText(child)).join('')
}

export function estimateTextWidth(text: string, fontSize: number, letterSpacing: number = 0): number {
  let width = 0

  for (const char of text) {
    if (char === ' ') {
      width += fontSize * 0.4
    } else if (/[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u30FF\uAC00-\uD7AF]/.test(char)) {
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

function estimateFormulaWidth(source: FormulaSource, fontSize: number, letterSpacing: number = 0): number {
  const mathml = source.format === 'latex' ? latexToMathML(source.source) : source.source
  const displayText = flattenText(parseMathML(mathml))
  let width = estimateTextWidth(displayText || source.source, fontSize, letterSpacing) * 1.15

  if (source.format === 'latex') {
    if (/\\frac/.test(source.source)) width += fontSize * 1.0
    if (/\\sqrt/.test(source.source)) width += fontSize * 0.4
    if (/\\int|\\sum|\\prod/.test(source.source)) width += fontSize * 0.4
  }

  return width
}

function estimateInlineTextWidth(text: string, fontSize: number, letterSpacing: number = 0): number {
  return estimateTextWidth(text, fontSize, letterSpacing) * 0.78
}

function getInlineFormulaMetrics(text: TextElement, source: string): InlineLayoutMetrics {
  const isCompactScript = /^[A-Za-z0-9]+[\^_]/.test(source) && !/\\frac|\\sqrt|\\int|\\sum|\\prod/.test(source)
  const inlineFontSize = text.fontSize * (isCompactScript ? 0.76 : 0.84)
  const widthBase = estimateFormulaWidth({ format: 'latex', source }, inlineFontSize, text.letterSpacing)
  const width = widthBase * (isCompactScript ? 0.58 : 0.72)
  const y = text.y - (isCompactScript ? text.fontSize * 0.14 : text.fontSize * 0.08)
  const h = Math.max(text.height * (isCompactScript ? 0.72 : 0.82), inlineFontSize * (isCompactScript ? 0.9 : 1.05))

  return {
    width,
    fontSize: inlineFontSize,
    y,
    h
  }
}

function wrapRun(text: string): string {
  return `<m:r><m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`
}

function wrapArg(tag: string, node: MathNode | undefined): string {
  return `<${tag}>${mathNodeToOmmlChildren(node)}</${tag}>`
}

function mathNodeToOmmlChildren(node: MathNode | undefined): string {
  if (!node) return ''
  if (node.name === 'math' || node.name === 'mrow') {
    return (node.children ?? []).map(child => mathNodeToOmmlChildren(child)).join('')
  }

  if (node.name === 'mi' || node.name === 'mn' || node.name === 'mo' || node.name === 'mtext') {
    return wrapRun(flattenText(node))
  }

  if (node.name === 'mfrac') {
    const [num, den] = node.children ?? []
    return `<m:f><m:fPr><m:type m:val="bar"/></m:fPr>${wrapArg('m:num', num)}${wrapArg('m:den', den)}</m:f>`
  }

  if (node.name === 'msqrt') {
    const radicand = node.children?.[0]
    return `<m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/>${wrapArg('m:e', radicand)}</m:rad>`
  }

  if (node.name === 'msub') {
    const [base, sub] = node.children ?? []
    return `<m:sSub><m:sSubPr><m:ctrlPr/></m:sSubPr>${wrapArg('m:e', base)}${wrapArg('m:sub', sub)}</m:sSub>`
  }

  if (node.name === 'msup') {
    const [base, sup] = node.children ?? []
    return `<m:sSup><m:sSupPr><m:ctrlPr/></m:sSupPr>${wrapArg('m:e', base)}${wrapArg('m:sup', sup)}</m:sSup>`
  }

  if (node.name === 'msubsup') {
    const [base, sub, sup] = node.children ?? []
    return `<m:sSubSup><m:sSubSupPr><m:ctrlPr/></m:sSubSupPr>${wrapArg('m:e', base)}${wrapArg('m:sub', sub)}${wrapArg('m:sup', sup)}</m:sSubSup>`
  }

  return (node.children ?? []).map(child => mathNodeToOmmlChildren(child)).join('')
}

export function mathMLToOmml(mathml: string): string {
  return mml2omml(mathml)
}

export function extractFormulaSource(input: string): FormulaSource | null {
  const trimmed = input.trim()

  if (!trimmed) return null

  if (/^<math[\s>]/i.test(trimmed) && /<\/math>$/i.test(trimmed)) {
    return { format: 'mathml', source: trimmed }
  }

  const patterns = [
    /^\$\$([\s\S]+)\$\$$/,
    /^\\\[([\s\S]+)\\\]$/,
    /^\$([\s\S]+)\$$/,
    /^\\\(([\s\S]+)\\\)$/
  ]

  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) {
      return { format: 'latex', source: match[1].trim() }
    }
  }

  return null
}

export function extractInlineFormulaSegments(input: string): InlineFormulaSegment[] | null {
  const segments: InlineFormulaSegment[] = []
  const pattern = /(\\\(([\s\S]+?)\\\)|\$([^\$\n]+?)\$)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(input)) !== null) {
    const start = match.index
    const end = pattern.lastIndex

    if (start > lastIndex) {
      segments.push({
        type: 'text',
        source: input.slice(lastIndex, start),
        displayText: input.slice(lastIndex, start)
      })
    }

    const source = (match[2] ?? match[3] ?? '').trim()
    if (source) {
      segments.push({
        type: 'formula',
        source,
        displayText: source
      })
    }

    lastIndex = end
  }

  if (lastIndex < input.length) {
    segments.push({
      type: 'text',
      source: input.slice(lastIndex),
      displayText: input.slice(lastIndex)
    })
  }

  if (!segments.some(segment => segment.type === 'formula') || segments.length < 2) {
    return null
  }

  for (let i = 0; i < segments.length; i++) {
    const current = segments[i]
    if (current.type !== 'formula') continue
    if (!/^[\^_]/.test(current.source)) continue

    const previous = segments[i - 1]
    if (!previous || previous.type !== 'text' || !previous.source) continue

    const prevChars = [...previous.source]
    const anchorChar = prevChars.pop()
    if (!anchorChar || !/[A-Za-z0-9)\]]/.test(anchorChar)) continue

    previous.source = prevChars.join('')
    previous.displayText = previous.source
    current.source = `${anchorChar}${current.source}`
  }

  return segments.filter(segment => segment.source.length > 0)
}

function resolveFormulaAlign(text: TextElement): 'left' | 'center' | 'right' {
  if (text.textAnchor === 'middle') return 'center'
  if (text.textAnchor === 'end') return 'right'

  const align = textAlignToPptx(text.textAlign)
  return align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'
}

export function convertTextToFormula(text: TextElement): ConvertedFormula | null {
  const formulaSource = extractFormulaSource(text.text)
  if (!formulaSource) {
    return null
  }

  const mathml = formulaSource.format === 'latex'
    ? latexToMathML(formulaSource.source)
    : formulaSource.source

  const omml = mathMLToOmml(mathml)

  return {
    type: 'formula',
    options: {
      x: pxToInch(text.x),
      y: pxToInch(text.y),
      w: pxToInch(text.width),
      h: pxToInch(text.height),
      fontSize: pxToPt(text.fontSize),
      color: undefined,
      align: resolveFormulaAlign(text),
      omml,
      objectName: text.id
    }
  }
}

export function convertMixedTextToFragments(text: TextElement): Array<ConvertedFormula | {
  type: 'text'
  text: string
  options: PptxGenJS.TextPropsOptions
}> | null {
  const segments = extractInlineFormulaSegments(text.text)
  if (!segments) {
    return null
  }

  const anchorX = text.textAnchor === 'middle'
    ? text.x + text.width / 2
    : text.textAnchor === 'end'
      ? text.x + text.width
      : text.x

  const widths = segments.map(segment => (
    segment.type === 'text'
      ? estimateInlineTextWidth(segment.source, text.fontSize, text.letterSpacing)
      : getInlineFormulaMetrics(text, segment.source).width
  ))

  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const startX = text.textAnchor === 'middle'
    ? anchorX - totalWidth / 2
    : text.textAnchor === 'end'
      ? anchorX - totalWidth
      : text.x

  let cursorX = startX
  const fragments: Array<ConvertedFormula | {
    type: 'text'
    text: string
    options: PptxGenJS.TextPropsOptions
  }> = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const width = widths[i]

    if (segment.type === 'text') {
      fragments.push({
        type: 'text',
        text: segment.source,
        options: {
          fontFace: text.fontFamily,
          fontSize: pxToPt(text.fontSize),
          bold: fontWeightToBool(text.fontWeight),
          italic: fontStyleToBool(text.fontStyle),
          x: pxToInch(cursorX),
          y: pxToInch(text.y),
          w: pxToInch(width),
          h: pxToInch(text.height),
          margin: 0,
          color: convertFillToColor(text.fill),
          align: 'left',
          valign: 'top'
        }
      })
    } else {
      const metrics = getInlineFormulaMetrics(text, segment.source)
      const formula = convertTextToFormula({
        ...text,
        text: `$${segment.source}$`,
        x: cursorX,
        y: metrics.y,
        width: metrics.width,
        height: metrics.h,
        fontSize: metrics.fontSize,
        textAnchor: 'start',
        textAlign: 'left'
      })
      if (formula) {
        formula.options.align = 'left'
        fragments.push(formula)
      }
    }

    cursorX += width
  }

  return fragments
}

export function __private__latexToMathML(latex: string): string {
  return latexToMathML(latex)
}

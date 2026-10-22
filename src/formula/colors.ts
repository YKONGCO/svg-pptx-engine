// Formula color management.
//
// The OMML converter (via `mathml2omml`) preserves `mathcolor`
// attributes on MathML elements and emits them as per-run
// `<a:rPr><a:solidFill>` blocks. We use that to drive two
// different colouring strategies:
//
//   1. "Per-element palette" — variables (`mi`), numbers (`mn`)
//      and operators (`mo`) get a deck-wide theme colour each.
//      Configurable via `setFormulaColors()`.
//   2. "Uniform formula colour" — every run gets the same hex
//      value (the `fill` of the SVG `<text>` element). This is
//      the most reliable path for PowerPoint because its inline
//      math renderer only honours run-level colour, not
//      `<m:oMathPr>` defaults.

/** Per-element colour overrides keyed by MathML tag. */
export interface FormulaColors {
  mi?: string
  mn?: string
  mo?: string
}

/** Default per-element palette (cyan / amber / gray). */
export const DEFAULT_FORMULA_COLORS: Required<FormulaColors> = {
  mi: '22D3EE',
  mn: 'FCD34D',
  mo: 'E2E8F0'
}

let currentFormulaColors: Required<FormulaColors> = { ...DEFAULT_FORMULA_COLORS }

export function setFormulaColors(colors: FormulaColors | null): void {
  currentFormulaColors = colors
    ? { ...DEFAULT_FORMULA_COLORS, ...colors }
    : { ...DEFAULT_FORMULA_COLORS }
}

export function getFormulaColors(): Readonly<Required<FormulaColors>> {
  return currentFormulaColors
}

/** Convert any CSS colour string to a 6-digit hex (with leading `#`).
 *  Already-hex strings pass through; rgb(...) and named colours
 *  are forwarded unchanged (PowerPoint's inline math renderer
 *  accepts only hex in `<a:srgbClr>` reliably). */
export function normaliseHexColor(raw: string): string {
  const s = String(raw).trim()
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase()
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3]
    return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase()
  }
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s}`.toUpperCase()
  if (/^[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[0], g = s[1], b = s[2]
    return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase()
  }
  return s
}

/** Stamp a per-element `mathcolor` attribute on every `<mi>`,
 *  `<mn>` and `<mo>` in the given MathML. Existing `mathcolor`
 *  attributes win (so an author-provided `\color{red}{x}` is
 *  preserved). */
export function injectMathColors(mathml: string, colors: Required<FormulaColors>): string {
  const mi = normaliseHexColor(colors.mi)
  const mn = normaliseHexColor(colors.mn)
  const mo = normaliseHexColor(colors.mo)
  return mathml
    .replace(/<mi(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mi${attrs ?? ''} mathcolor="${mi}">`)
    .replace(/<mn(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mn${attrs ?? ''} mathcolor="${mn}">`)
    .replace(/<mo(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mo${attrs ?? ''} mathcolor="${mo}">`)
}

/** Stamp a single colour on every `<mi>` / `<mn>` / `<mo>` so
 *  the entire formula renders in one colour. Author-provided
 *  `mathcolor` attributes still win. */
export function injectUniformMathColor(mathml: string, color: string): string {
  const hex = normaliseHexColor(color).replace(/^#/, '')
  return mathml
    .replace(/<mi(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mi${attrs ?? ''} mathcolor="${hex}">`)
    .replace(/<mn(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mn${attrs ?? ''} mathcolor="${hex}">`)
    .replace(/<mo(\s[^>]*)?>/g, (match, attrs: string | undefined) =>
      attrs && /\bmathcolor\s*=/.test(attrs) ? match : `<mo${attrs ?? ''} mathcolor="${hex}">`)
}

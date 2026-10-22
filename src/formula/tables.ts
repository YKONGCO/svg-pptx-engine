// LaTeX command → Unicode character tables.
//
// Each export is the lookup table consumed by the LaTeX parser when it
// sees a backslash command. The tables are intentionally exhaustive
// for the typical high-school → undergrad curriculum; commands not
// listed fall through to a generic identifier rendering.

/** `\alpha` → α, `\Gamma` → Γ, etc. */
export const GREEK_MAP: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ϵ',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'ϕ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω'
}

/** `\cdot` → ·, `\sum` → ∑, `\to` → →, etc. */
export const OPERATOR_MAP: Record<string, string> = {
  // arithmetic
  cdot: '·',
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  circ: '∘',
  bullet: '•',
  ast: '∗',
  star: '⋆',
  // relations
  leq: '≤', le: '≤', leqslant: '≤',
  geq: '≥', ge: '≥', geqslant: '≥',
  neq: '≠', ne: '≠',
  equiv: '≡', approx: '≈', cong: '≅',
  sim: '∼', simeq: '≃',
  propto: '∝', asymp: '≍',
  ll: '≪', gg: '≫',
  prec: '≺', succ: '≻',
  // arrows
  to: '→', rightarrow: '→', longrightarrow: '⟶',
  gets: '←', leftarrow: '←', longleftarrow: '⟵',
  leftrightarrow: '↔', longleftrightarrow: '⟷',
  Rightarrow: '⇒', Longrightarrow: '⟹',
  Leftarrow: '⇐', Longleftarrow: '⟸',
  Leftrightarrow: '⇔', Longleftrightarrow: '⟺',
  uparrow: '↑', downarrow: '↓',
  mapsto: '↦', hookrightarrow: '↪',
  // big operators
  sum: '∑', prod: '∏', coprod: '∐',
  int: '∫', iint: '∬', iiint: '∭', iiiint: '⨌',
  oint: '∮',
  bigcap: '⋂', bigcup: '⋃',
  bigoplus: '⊕', bigotimes: '⊗',
  // set theory
  emptyset: '∅',
  in: '∈', ni: '∋', notin: '∉',
  subset: '⊂', supset: '⊃',
  subseteq: '⊆', supseteq: '⊇',
  subsetneq: '⊊', supsetneq: '⊋',
  nsubset: '⊄', nsupset: '⊅',
  cup: '∪', cap: '∩', setminus: '∖',
  // logic
  forall: '∀', exists: '∃', nexists: '∄',
  neg: '¬', lnot: '¬', not: '¬',
  lor: '∨', land: '∧',
  models: '⊨', vdash: '⊢', nvdash: '⊬',
  // misc symbols
  infty: '∞', partial: '∂', nabla: '∇',
  hbar: 'ℏ', ell: 'ℓ',
  Re: 'ℜ', Im: 'ℑ',
  aleph: 'ℵ', wp: '℘', beth: 'ℶ', gimel: 'ℷ',
  prime: '′', dprime: '″', backprime: '‵',
  therefore: '∴', because: '∵',
  angle: '∠', measuredangle: '∡',
  triangle: '△', square: '□', Diamond: '◇',
  clubsuit: '♣', diamondsuit: '♦', heartsuit: '♥', spadesuit: '♠',
  // literal backslash (used in set-builder notation `{x \mid x ∈ A}`)
  backslash: '\\',
  // delimiter aliases — usable on their own without \left/\right
  lvert: '|', rvert: '|', lVert: '‖', rVert: '‖',
  // middle bar (e.g. `{x \mid x ∈ A}`)
  mid: '|', shortmid: '|',
  // dots
  ldots: '…', cdots: '⋯', dots: '…',
  dotsc: '…', dotsb: '⋯', dotsm: '⋯', dotsi: '…',
  vdots: '⋮', ddots: '⋱'
}

/** LaTeX commands that should be typeset as upright "operator"
 *  text rather than a sequence of italic identifiers. The MathML
 *  output uses `<mi mathvariant="normal">` so OMML keeps the
 *  upright shape in PowerPoint. */
export const OPERATOR_NAMES = new Set([
  // trig
  'sin', 'cos', 'tan', 'csc', 'sec', 'cot',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  // log / exp
  'log', 'ln', 'exp', 'lg',
  // calculus / analysis
  'lim', 'liminf', 'limsup', 'inf', 'sup', 'max', 'min',
  // algebra
  'det', 'dim', 'ker', 'hom', 'gcd', 'deg', 'arg',
  // probability / stats
  'Pr', 'P', 'E',
  // misc
  'mod'
])

/** Accents that place a diacritic over a single argument:
 *  `\bar x`, `\vec x`, `\hat x`, `\tilde x`, etc. Each maps to
 *  a `<mover>` MathML node carrying the right accent character. */
export const ACCENT_OVER: Record<string, string> = {
  bar: '¯',
  vec: '→',
  hat: '̂',
  tilde: '̃',
  dot: '̇',
  ddot: '̈',
  acute: '́',
  grave: '̀',
  check: '̌',
  breve: '̆',
  widetilde: '̃',
  widehat: '̂'
}

/** `\overline{x}` and `\underline{x}` — MathML uses `<mover>` /
 *  `<munder>` with a 0-width `accent="false"` stretch. */
export const LINE_OVER: Record<string, string> = {
  overline: '‾',
  underline: '_'
}

/** The dotted-ellipsis variants. MathML collapses them all into
 *  one of three characters; the choice affects vertical alignment
 *  when the dots are between operators. */
export const DOTS: Record<string, string> = {
  ldots: '…',
  cdots: '⋯',
  dots: '…',
  dotsc: '…',
  dotsb: '⋯',
  dotsm: '⋯',
  dotsi: '…',
  vdots: '⋮',
  ddots: '⋱'
}

/** Math environments that the parser understands. Each entry is
 *  the LaTeX environment name → the two characters (open, close)
 *  that should be drawn around the resulting `<mtable>`. */
export const MATRIX_ENVS: Record<string, [string, string]> = {
  matrix: ['', ''],
  pmatrix: ['(', ')'],
  bmatrix: ['[', ']'],
  Bmatrix: ['{', '}'],
  vmatrix: ['|', '|'],
  Vmatrix: ['‖', '‖'],
  cases: ['{', '']
}

/** Single character that the LaTeX `\left` / `\right` pair opens
 *  or closes with. Includes the standard bracket family plus the
 *  common empty-marker `.` (e.g. `\left. \frac{a}{b} \right)`). */
export const LEFT_RIGHT_DELIMS: Record<string, string> = {
  '(': '(',
  ')': ')',
  '[': '[',
  ']': ']',
  '\\{': '{',
  '\\}': '}',
  '|': '|',
  '.': '',
  '/': '/',
  '\\\\': '\\'
}

export const TEXT_COMMANDS = new Set([
  'text', 'mathrm', 'operatorname', 'mathbf', 'mathit', 'mathbb',
  'mathcal', 'mathfrak', 'mathsf', 'mathtt',
  'textrm', 'textbf', 'textit'
])

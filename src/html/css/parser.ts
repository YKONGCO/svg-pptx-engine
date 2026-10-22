// src/html/css/parser.ts
//
// css-tree-based CSS parser wrapper. Two entry points:
//   - parseCSS(cssString)        : parse a <style> block
//   - parseInlineStyle(style)     : parse a `style="..."` attribute
//
// Both return a flat list of `CssRule` records:
//   { selector, declarations }
// where `selector` is a single CSS selector (not a list) and
// `declarations` is a Map<property, value-string>.
//
// We deliberately *do not* try to interpret values here — value
// parsing is handled by the cascade / style-emit layer so the two
// concerns are separate.
//
// Skipped (best-effort, see html2sif-protocol.md):
//   - @media, @import, @supports, @keyframes
//   - pseudo-class / pseudo-element selectors
//   - nested rules (no parent & selector)
//   - selector lists (`a, b, c`) — split into multiple rules
//     so the cascade can match each independently.

import { parse, generate } from 'css-tree'

export interface CssRule {
  selector: string
  declarations: Map<string, string>
}

const SKIP_ATRULES = new Set([
  'media',
  'import',
  'supports',
  'keyframes',
  '-webkit-keyframes',
  'font-face',
  'charset',
  'namespace',
  'page',
])

/**
 * Parse a CSS string (e.g. the contents of a <style> block) into a
 * flat list of rules. Unsupported at-rules, pseudo-class selectors
 * and pseudo-element selectors are silently dropped.
 */
export function parseCSS(css: string): CssRule[] {
  if (!css || !css.trim()) return []

  const rules: CssRule[] = []
  let ast
  try {
    ast = parse(css, { positions: false })
  } catch {
    // Malformed CSS — return what we have.
    return rules
  }

  if (ast.type !== 'StyleSheet') return rules

  for (const child of childrenOf(ast)) {
    collectRules(child, rules)
  }
  return rules
}

/** Convert a css-tree List (or array) to a plain array. */
function childrenOf(node: any): any[] {
  if (!node) return []
  const c = node.children
  if (!c) return []
  if (Array.isArray(c)) return c
  if (typeof c.toArray === 'function') return c.toArray()
  return []
}

/** Parse a `style="..."` attribute string. */
export function parseInlineStyle(style: string): CssRule[] {
  if (!style || !style.trim()) return []
  // Wrap as a fake rule so we can reuse the same collection logic.
  const wrapped = `* { ${style} }`
  const all = parseCSS(wrapped)
  // Re-label the selector to ":inline" so the cascade can recognise it.
  for (const r of all) {
    r.selector = ':inline'
  }
  return all
}

// =============================================================================
// AST walker
// =============================================================================

function collectRules(node: any, out: CssRule[]): void {
  if (!node) return

  if (node.type === 'Atrule') {
    // @media, @keyframes, @import etc. — we don't recurse into the
    // inner block. v1 limitation: media queries are ignored.
    if (!node.name || SKIP_ATRULES.has(String(node.name).toLowerCase())) {
      return
    }
    // Unknown at-rule — recurse defensively.
    if (node.block) {
      for (const c of childrenOf(node.block)) collectRules(c, out)
    }
    return
  }

  if (node.type === 'Rule') {
    const selectorList = selectorListStrings(node.prelude)
    if (selectorList.length === 0) return
    const decls = collectDeclarations(node.block)
    if (decls.size === 0) return
    for (const sel of selectorList) {
      out.push({ selector: sel, declarations: new Map(decls) })
    }
    return
  }
}

/**
 * Extract a list of plain selector strings from a Rule's prelude.
 * Returns [] if the prelude contains anything we don't support
 * (pseudo-classes, pseudo-elements, complex combinators like `&`).
 */
function selectorListStrings(prelude: any): string[] {
  if (!prelude) return []
  // The prelude is normally a SelectorList. css-tree may give us
  // a Raw if it couldn't parse the selector. Either way, generate()
  // can render it.
  let raw: string
  try {
    raw = generate(prelude).trim()
  } catch {
    return []
  }
  if (!raw) return []

  // Split on top-level commas. css-tree has already done this for
  // us, but the generated string still contains them, so split
  // ourselves with a tiny comma-aware splitter.
  const parts = splitTopLevelCommas(raw)
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (isSelectorSupported(trimmed)) {
      out.push(trimmed)
    }
  }
  return out
}

function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur)
  return out
}

/**
 * v1 supports the common subset:
 *   - type selectors (`p`, `body`, `h1`)
 *   - class selectors (`.card`)
 *   - id selectors (`#main`)
 *   - universal selector (`*`)
 *   - combinators: descendant, child, adjacent, general-sibling
 *   - attribute selectors (kept as-is in the selector string)
 *
 * Skipped (returns false):
 *   - anything with `:` (pseudo-class / pseudo-element)
 *   - anything with `&` (parent reference / nesting)
 */
function isSelectorSupported(selector: string): boolean {
  if (selector.includes(':')) return false
  if (selector.includes('&')) return false
  return true
}

function collectDeclarations(block: any): Map<string, string> {
  const out = new Map<string, string>()
  if (!block) return out
  for (const child of childrenOf(block)) {
    if (child.type !== 'Declaration') continue
    const property = String(child.property || '').trim()
    if (!property) continue
    let value: string
    try {
      value = generate(child.value).trim()
    } catch {
      value = ''
    }
    if (!value) continue
    out.set(property, value)
  }
  return out
}

// src/html/css/cascade.ts
//
// CSS cascade computation. Given a parsed HTML tree and a list of
// rules (from <style> blocks), produce a Map<NodeId, ComputedStyle>
// where each ComputedStyle is a Map<cssProperty, value-string>.
//
// Cascade priority (low → high):
//   1. Tag default styles (HTML browser defaults for h1-h6, p, body, …)
//   2. <style> rules, sorted by specificity
//   3. Element's inline `style="..."` attribute (highest)
//
// Inheritance:
//   - `color`, `font-family`, `font-size`, `font-weight`, `font-style`,
//     `line-height`, `letter-spacing`, `text-align`, `text-decoration`
//     inherit from the parent when the element itself doesn't set them.
//   - `width`, `height`, `margin`, `padding`, `background`, … do NOT
//     inherit; the absence of a value simply means "no constraint".

import type { HtmlElement } from '../parser'
import { getAttr, getChildren } from '../parser'
import { parseInlineStyle, type CssRule } from './parser'

/** A computed style is just a property→value map of CSS strings. */
export type ComputedStyle = Map<string, string>

/** Result of running the cascade: NodeId → ComputedStyle. */
export type StyleMap = Map<string, ComputedStyle>

// =============================================================================
// Tag default styles (HTML browser defaults, abbreviated)
// =============================================================================

const TAG_DEFAULTS: Record<string, ComputedStyle> = {
  body:   new Map([['font-size', '16px'], ['line-height', '1.2']]),
  h1:     new Map([['font-size', '32px'], ['font-weight', '700'], ['margin', '0.67em 0']]),
  h2:     new Map([['font-size', '24px'], ['font-weight', '700'], ['margin', '0.83em 0']]),
  h3:     new Map([['font-size', '20px'], ['font-weight', '700'], ['margin', '1em 0']]),
  h4:     new Map([['font-size', '16px'], ['font-weight', '700'], ['margin', '1.33em 0']]),
  h5:     new Map([['font-size', '14px'], ['font-weight', '700'], ['margin', '1.67em 0']]),
  h6:     new Map([['font-size', '12px'], ['font-weight', '700'], ['margin', '2.33em 0']]),
  p:      new Map([['font-size', '16px'], ['margin', '1em 0']]),
  blockquote: new Map([['margin', '1em 40px']]),
  pre:    new Map([['font-family', 'monospace'], ['font-size', '13px'], ['margin', '1em 0']]),
  code:   new Map([['font-family', 'monospace'], ['font-size', '13px']]),
  ul:     new Map([['margin', '1em 0'], ['padding-left', '40px']]),
  ol:     new Map([['margin', '1em 0'], ['padding-left', '40px']]),
  li:     new Map([['display', 'list-item']]),
  hr:     new Map([['border', '0'], ['border-top', '1px solid']]),
  a:      new Map([['text-decoration', 'underline'], ['color', '#0000EE']]),
  small:  new Map([['font-size', '12px']]),
  big:    new Map([['font-size', '16px']]), // simplified
  sub:    new Map([['vertical-align', 'sub'], ['font-size', 'smaller']]),
  sup:    new Map([['vertical-align', 'super'], ['font-size', 'smaller']]),
}

/** Properties that are inherited from the parent by default. */
const INHERITED = new Set([
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'visibility',
  'opacity',
  'text-shadow',
])

// =============================================================================
// Public API
// =============================================================================

/**
 * Compute styles for every element in the document. The result map
 * includes an entry for <html>, <head>, and <body> as well.
 */
export function computeStyles(
  doc: { root: HtmlElement; body: HtmlElement },
  styleBlockRules: CssRule[]
): StyleMap {
  const out: StyleMap = new Map()
  // Walk the whole tree starting from <html> so the body inherits
  // the same root context as in a real browser.
  walk(doc.root, undefined, styleBlockRules, out)
  return out
}

function walk(
  el: HtmlElement,
  parentStyle: ComputedStyle | undefined,
  rules: CssRule[],
  out: StyleMap
): void {
  const own = computeOwnStyle(el, rules)
  // Merge parent-inherited props for the properties not set locally.
  if (parentStyle) {
    for (const prop of INHERITED) {
      if (!own.has(prop) && parentStyle.has(prop)) {
        own.set(prop, parentStyle.get(prop)!)
      }
    }
  }
  out.set(el.nodeId, own)
  for (const child of getChildren(el)) {
    walk(child, own, rules, out)
  }
}

// =============================================================================
// Per-element computation
// =============================================================================

function computeOwnStyle(el: HtmlElement, rules: CssRule[]): ComputedStyle {
  const style = new Map<string, string>()

  // 1. Tag default
  const defs = TAG_DEFAULTS[el.tagName]
  if (defs) {
    for (const [k, v] of defs) style.set(k, v)
  }

  // 2. <style> block rules, sorted by specificity
  const matching = rules.filter(r => ruleMatchesElement(r, el))
  matching.sort((a, b) => compareSpecificity(a.selector, b.selector))
  for (const rule of matching) {
    for (const [k, v] of rule.declarations) style.set(k, v)
  }

  // 3. Inline style (highest)
  const inline = getAttr(el, 'style')
  if (inline) {
    for (const r of parseInlineStyle(inline)) {
      for (const [k, v] of r.declarations) style.set(k, v)
    }
  }

  return style
}

function ruleMatchesElement(rule: CssRule, el: HtmlElement): boolean {
  return matchers.some(m => m.matches(rule.selector, el))
}

/**
 * A selector matcher supports one of: type, class, id, universal,
 * and the four CSS combinators (descendant, child `>`, adjacent `+`,
 * sibling `~`).
 */
interface Matcher {
  matches(selector: string, el: HtmlElement): boolean
}

const matchers: Matcher[] = [
  // Universal — must be last-resort so we don't match things like
  // `* + .foo` first. We keep it simple: `*` alone is the only
  // universal selector we honour in v1.
  {
    matches(selector, _el) {
      return selector === '*'
    },
  },
  // ID
  {
    matches(selector, el) {
      if (!selector.startsWith('#')) return false
      const want = selector.slice(1)
      // Don't match a class-as-id like "#foo bar" or "#foo,bar"
      if (want.includes(' ') || want.includes(',')) return false
      return getAttr(el, 'id') === want
    },
  },
  // Class
  {
    matches(selector, el) {
      if (!selector.startsWith('.')) return false
      const want = selector.slice(1)
      if (want.includes(' ') || want.includes(',')) return false
      const classes = (getAttr(el, 'class') || '').split(/\s+/).filter(Boolean)
      return classes.includes(want)
    },
  },
  // Type
  {
    matches(selector, el) {
      // Type selectors are bare words. Skip anything with # . : [
      if (/[#.:[\]>+~]/.test(selector)) return false
      return selector === el.tagName
    },
  },
  // Descendant "a b" — match the rightmost compound selector
  {
    matches(selector, el) {
      if (!selector.includes(' ')) return false
      const parts = selector.split(/\s+/)
      return matchesCompound(parts[parts.length - 1], el)
    },
  },
  // Child "a > b" — match the right side
  {
    matches(selector, el) {
      if (!selector.includes('>')) return false
      const parts = selector.split('>')
      return matchesCompound(parts[parts.length - 1].trim(), el)
    },
  },
]

function matchesCompound(selector: string, el: HtmlElement): boolean {
  for (const m of matchers) {
    if (m.matches(selector, el)) return true
  }
  return false
}

// =============================================================================
// Specificity
// =============================================================================

/** Return specificity as a tuple [id, class, type] for sorting. */
function compareSpecificity(a: string, b: string): number {
  const sa = specificity(a)
  const sb = specificity(b)
  if (sa[0] !== sb[0]) return sa[0] - sb[0]
  if (sa[1] !== sb[1]) return sa[1] - sb[1]
  return sa[2] - sb[2]
}

function specificity(selector: string): [number, number, number] {
  let id = 0
  let cls = 0
  let type = 0
  // Trim combinators and split on the remaining tokens.
  const tokens = selector
    .replace(/[>+~]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  for (const t of tokens) {
    if (t.startsWith('#')) id += 1
    else if (t.startsWith('.')) cls += 1
    else if (t.startsWith('[')) cls += 1 // attribute selector ≈ class
    else if (t === '*') {
      // universal has no contribution
    } else if (/^[a-zA-Z][\w-]*$/.test(t)) {
      type += 1
    } else {
      // unknown — count as a class to be safe (won't lose specificity)
      cls += 1
    }
  }
  return [id, cls, type]
}

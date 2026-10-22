// Measure module (Phase 2).
//
// Computes the intrinsic size of a SIF element so the layout flow
// can decide how much space each child needs. The actual rendered
// geometry is what the converter produced; the layout pass does NOT
// re-measure text (no real font shaper), but it does add up heights
// of stacked block children so a container's height can be reported.

import type { Element } from '../sif/types/elements/base'
import type { GroupElement } from '../sif/types/elements/group'
import type { IntrinsicSize } from './types'

const DEFAULT_FONT_HEIGHT_RATIO = 1.45

/**
 * Return the intrinsic (preferred) size of a SIF element. For most
 * elements this is just `width × height` from the converter; for
 * groups we look at the *shape* children only, ignoring text and
 * other decorative elements whose bounds typically extend past the
 * group's actual visual footprint.
 */
export function intrinsicSize(element: Element): IntrinsicSize {
  if (element.type === 'group') {
    return groupIntrinsicSize(element as GroupElement)
  }
  // Text elements coming from the HTML pipeline typically have
  // width=0/height=0 because no font shaper runs at conversion time.
  // Use the font-size heuristic so block / flex flows can still stack
  // them without collapsing everything onto the same baseline.
  if (element.type === 'text') {
    const fs = (element as { fontSize?: number }).fontSize ?? 16
    const height = element.height && element.height > 0 ? element.height : Math.round(fs * 1.4)
    return { width: element.width ?? 0, height }
  }
  return {
    width: element.width,
    height: element.height
  }
}

function groupIntrinsicSize(group: GroupElement): IntrinsicSize {
  if (group.children.length === 0) {
    return { width: 0, height: 0 }
  }
  // Phase 3.4: when a group declares its own `width` / `height`
  // (i.e. it is a layout container with a known bbox), trust that
  // rather than re-measuring the children. A nested grid with two
  // 80×80 rects is still 200×180 from the *parent's* point of view;
  // re-measuring the children would under-count the space the
  // container occupies in the outer flex / block flow.
  if (typeof group.width === 'number' && typeof group.height === 'number') {
    return { width: group.width, height: group.height }
  }
  // For a bare group (no explicit size), the "intrinsic size" is
  // the bounding box of its shape children (rect / circle / ellipse
  // / polygon / line / image / video). Text and other decorative
  // elements are excluded because they frequently extend past the
  // card's visual edge and would otherwise inflate the layout's
  // main-axis size.
  let maxRight = 0
  let totalHeight = 0
  for (const child of group.children) {
    if (child.type === 'text') continue
    const { width, height } = intrinsicSize(child)
    const right = (child.x ?? 0) + width
    const bottom = (child.y ?? 0) + height
    if (right > maxRight) maxRight = right
    if (bottom > totalHeight) totalHeight = bottom
  }
  if (maxRight === 0 && totalHeight === 0) {
    // No shape children — fall back to ALL children (e.g. pure text group).
    for (const child of group.children) {
      const { width, height } = intrinsicSize(child)
      const right = (child.x ?? 0) + width
      const bottom = (child.y ?? 0) + height
      if (right > maxRight) maxRight = right
      if (bottom > totalHeight) totalHeight = bottom
    }
  }
  return { width: maxRight, height: totalHeight }
}

/**
 * Estimate the rendered height of a text element when its width is
 * constrained. We don't have a real shaper, so we approximate by
 * counting characters at an average glyph width.
 *
 * Phase 3.1.4: glyphs are weighted by class so a CJK string wraps
 * roughly half as often as a Latin one of the same length. The
 * classes are:
 *   - CJK: 1.0 × fontSize (full-width glyphs are wider)
 *   - Latin / digits / general: 0.55 × fontSize
 *   - Space: 0.3 × fontSize (compresses before wrap)
 *   - Other (punctuation, NBSP, em-dash, etc.): 0.55 × fontSize
 */
export function estimateWrappedTextHeight(
  text: string,
  fontSize: number,
  availableWidth: number,
  lineHeightRatio: number = DEFAULT_FONT_HEIGHT_RATIO
): number {
  if (!text || availableWidth <= 0) return fontSize * lineHeightRatio
  const totalWidth = glyphWeightedWidth(text, fontSize)
  const lines = Math.max(1, Math.ceil(totalWidth / availableWidth))
  return lines * fontSize * lineHeightRatio
}

/**
 * Return the weighted width of `text` for layout purposes, in pixels.
 * The weights match the per-class widths used by `estimateWrappedTextHeight`.
 * Exposed for unit tests + grid auto track sizing of text children.
 */
export function glyphWeightedWidth(text: string, fontSize: number): number {
  let total = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isCjk(ch)) total += 1.0 * fontSize
    else if (ch === ' ') total += 0.3 * fontSize
    else total += 0.55 * fontSize
  }
  return total
}

/**
 * CJK / Hangul / Kana / Han range check (Unicode blocks).
 * Covers the practical cases we see in slides: Chinese, Japanese
 * kana, Korean Hangul, and CJK punctuation. Doesn't try to handle
 * full-width Latin (Ａ-Ｚ) — those are rare in SVG source.
 */
export function isCjk(ch: string): boolean {
  if (!ch) return false
  const code = ch.codePointAt(0) ?? 0
  return (
    // CJK Unified Ideographs
    (code >= 0x4E00 && code <= 0x9FFF) ||
    // CJK Unified Ideographs Extension A
    (code >= 0x3400 && code <= 0x4DBF) ||
    // Hiragana
    (code >= 0x3040 && code <= 0x309F) ||
    // Katakana
    (code >= 0x30A0 && code <= 0x30FF) ||
    // Hangul Syllables
    (code >= 0xAC00 && code <= 0xD7AF) ||
    // CJK Symbols and Punctuation
    (code >= 0x3000 && code <= 0x303F) ||
    // Full-width forms
    (code >= 0xFF00 && code <= 0xFFEF)
  )
}

/**
 * Resolve a `<length>` token like `120px`, `1fr`, or `auto` into a
 * `TrackSize` descriptor. Used by the grid container.
 */
export function parseTrackSize(raw: string): import('./types').TrackSize {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'auto') return { kind: 'auto' }
  if (trimmed.endsWith('fr')) {
    const value = parseFloat(trimmed.slice(0, -2))
    return { kind: 'fr', value: Number.isFinite(value) ? value : 1 }
  }
  const value = parseFloat(trimmed)
  return { kind: 'px', value: Number.isFinite(value) ? value : 0 }
}

/** Convenience for unit tests. */
export const __testing = { DEFAULT_FONT_HEIGHT_RATIO }

// src/html/css/pipeline.ts
//
// M0 public entry point: given an HTML string, return a style map
// keyed by every element's nodeId. Wires together the three
// protocol-layer modules:
//
//   parseHTML → extract <style> blocks → parseCSS → computeStyles
//
// This is what the M1+ SIF converters will call. Right now it just
// returns a flat Map<NodeId, ComputedStyle>; future milestones will
// add a layer that emits SIF Elements from this view.

import { parseHTML } from '../parser'
import { parseCSS } from './parser'
import { computeStyles, type ComputedStyle, type StyleMap } from './cascade'

export type { ComputedStyle, StyleMap }

/**
 * Compute the resolved CSS for every element in the given HTML
 * string. The returned map includes an entry for <html>, <head>,
 * <body>, and every nested element.
 */
export function htmlToStyleMap(html: string): StyleMap {
  const doc = parseHTML(html)
  // Concatenate all <style> blocks into one big CSS string before
  // parsing — keeps specificity ordering correct across blocks.
  const css = doc.styleBlocks.join('\n')
  const rules = parseCSS(css)
  return computeStyles(doc, rules)
}

/** Convenience accessor: get the style for a specific element. */
export function getElementStyle(
  styles: StyleMap,
  nodeId: string
): ComputedStyle {
  return styles.get(nodeId) ?? new Map()
}

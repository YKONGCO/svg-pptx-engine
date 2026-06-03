// Icon element types
//
// A standalone placeholder for icon-like elements. Phase 1 will replace
// this with a full representation (e.g. embedded SVG path, font-icon
// glyph). For Phase 0 we only need a type that lets the SIF union compile
// and round-trip through the pipeline.
import { BaseElement } from './base'

/**
 * Icon element.
 *
 * `IconElement` is a logical placeholder for vector icons emitted by
 * icon fonts or by inline SVG fragments. It carries a `name` to identify
 * the icon, and a `glyph` string used to look up the icon's outline path
 * in a registered icon set.
 */
export interface IconElement extends BaseElement {
  type: 'icon'
  /** Icon name (e.g. `mdi:home`). */
  name: string
  /** Glyph or path data for rendering. Optional — when absent the icon
   * is drawn as a placeholder rect of the element's bounds. */
  glyph?: string
}

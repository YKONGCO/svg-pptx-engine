// Tests for SVG `<clipPath>` element support (Phase 1.3).
//
// Goal: the SVG converter recognizes clipPath defs, resolves
// `clip-path="url(#id)"` on shape elements, and stamps the resolved id
// onto the SIF element's `clipPathId` field. The PPTX layer (out of
// scope here) consumes that field to apply the mask.

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import type { ShapeElement, BaseElement } from '../../src/sif'

beforeEach(() => {
  resetIdCounter()
})

describe('SVG <clipPath> resolution', () => {
  it('attaches clipPathId when a shape references a clipPath', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="myClip">
          <rect x="0" y="0" width="100" height="100" />
        </clipPath>
      </defs>
      <rect x="10" y="10" width="180" height="180" fill="red" clip-path="url(#myClip)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as ShapeElement & BaseElement
    expect(rect.type).toBe('shape')
    expect((rect as any).clipPathId).toBe('myClip')
  })

  it('omits clipPathId when no clip-path attribute is set', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="50" height="50" fill="red" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as any
    expect(rect.clipPathId).toBeUndefined()
  })

  it('does not render an unreferenced <clipPath> in <defs> as an element', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="orphan">
          <rect width="50" height="50" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="20" height="20" fill="blue" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    // The clipPath stays in defs; only the rect is emitted.
    expect((elements[0] as ShapeElement).shapeType).toBe('rect')
  })

  it('propagates clipPathId through <g> children', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="groupClip">
          <rect width="100" height="100" />
        </clipPath>
      </defs>
      <g clip-path="url(#groupClip)">
        <rect x="0" y="0" width="50" height="50" fill="green" />
      </g>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: true })
    expect(elements).toHaveLength(1)
    const group = elements[0] as any
    expect(group.type).toBe('group')
    // When preserveGroups=true, the clip-path stays on the group itself
    // (no descendant traversal needed; downstream renderer applies the
    // mask to the group as a whole).
    expect(group.clipPathId).toBe('groupClip')
  })

  it('accepts clipPathUnits attribute (parses without error)', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="bboxClip" clipPathUnits="objectBoundingBox">
          <rect x="0" y="0" width="1" height="1" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="red" clip-path="url(#bboxClip)" />
    </svg>`

    expect(() => svgToSif(svg, { preserveGroups: false })).not.toThrow()
    const elements = svgToSif(svg, { preserveGroups: false })
    expect((elements[0] as any).clipPathId).toBe('bboxClip')
  })
})

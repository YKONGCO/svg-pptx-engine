// Tests for SVG `<pattern>` element support (Phase 1.4).
//
// Behavior under test:
//   1. <pattern> in <defs> is recognised; it does not emit elements
//      when unreferenced.
//   2. `fill="url(#patternId)"` on a shape stamps `patternFillId` on
//      the SIF element when the id is NOT a known gradient.
//   3. The pattern attribute fingerprint (width/height/patternUnits)
//      is read without error.
//   4. Patterns can be combined with clip-path.

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import type { ShapeElement } from '../../src/sif'

beforeEach(() => {
  resetIdCounter()
})

describe('SVG <pattern> resolution', () => {
  it('stamps patternFillId on a shape with fill="url(#pat)"', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="2" fill="red" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#dots)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as ShapeElement & { patternFillId?: string }
    expect(rect.type).toBe('shape')
    expect(rect.patternFillId).toBe('dots')
  })

  it('does not emit elements for an unreferenced <pattern>', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="orphanPat" width="10" height="10">
          <rect width="10" height="10" fill="red" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="20" height="20" fill="blue" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    expect((elements[0] as ShapeElement).shapeType).toBe('rect')
    expect((elements[0] as any).fill.type).toBe('solid')
  })

  it('reads patternUnits and patternContentUnits without error', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="gray" stroke-width="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#grid)" />
    </svg>`

    expect(() => svgToSif(svg, { preserveGroups: false })).not.toThrow()
    const elements = svgToSif(svg, { preserveGroups: false })
    expect((elements[0] as any).patternFillId).toBe('grid')
  })

  it('preserves gradient fill when the id is a known gradient', () => {
    // A url(#id) fill pointing to a linearGradient should NOT be
    // mistaken for a pattern. The existing gradient resolution path
    // remains authoritative.
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(0,0,255);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#grad)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as any
    // gradient fill wins; patternFillId is NOT set
    expect(rect.patternFillId).toBeUndefined()
    expect(rect.fill.type).toBe('gradient')
  })

  it('combines pattern fill with a clipPath', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="c">
          <rect width="50" height="50" />
        </clipPath>
        <pattern id="pat" width="10" height="10">
          <rect width="10" height="10" fill="red" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#pat)" clip-path="url(#c)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as any
    expect(rect.patternFillId).toBe('pat')
    expect(rect.clipPathId).toBe('c')
  })
})

// Tests for SVG `<textPath>` and SMIL animation snapshotting (Phase 1.5).
//
// Phase 1.5 goals:
//   1. <textPath href="#pathId"> is recognised and stamps `textPath.d`
//      on the SIF TextElement.
//   2. <set>/<animate> with `fill="freeze"` are applied to their
//      previous sibling: the target element's attributes are mutated
//      to the animation's end value.
//   3. <animateTransform type="translate"> bakes a translate(...)
//      into the target's transform.
//   4. <animateMotion path="..."> bakes a translate(0,0) → end
//      translate(...) onto the target.

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import type { ShapeElement, TextElement } from '../../src/sif'

beforeEach(() => {
  resetIdCounter()
})

describe('SVG <textPath>', () => {
  it('stamps textPath.d on a TextElement when a <textPath href="#id"> child is present', () => {
    const svg = `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <path id="curve" d="M10,80 C 100,10 300,10 390,80" fill="none" />
      </defs>
      <text x="0" y="0" font-size="20" fill="black">
        <textPath href="#curve">Hello path</textPath>
      </text>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    const text = elements[0] as TextElement & { textPath?: { d: string; startOffset: number } }
    expect(text.type).toBe('text')
    expect(text.textPath).toBeDefined()
    expect(text.textPath!.d).toBe('M10,80 C 100,10 300,10 390,80')
  })

  it('returns a text element without textPath when no textPath child', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="50" font-size="20">plain</text>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const text = elements[0] as TextElement & { textPath?: unknown }
    expect(text.textPath).toBeUndefined()
  })
})

describe('SVG SMIL animation snapshotting', () => {
  it('applies <set attributeName="x" to="50" fill="freeze"> to the previous sibling', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="r" x="0" y="0" width="20" height="20" fill="blue">
        <set attributeName="x" to="50" dur="1s" fill="freeze" />
      </rect>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as ShapeElement
    // Animation snapshot pushes the rect to x=50 (its end value).
    expect(rect.x).toBe(50)
  })

  it('applies <animate attributeName="fill" to="red"> to the previous sibling', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="r" x="0" y="0" width="20" height="20" fill="blue">
        <animate attributeName="fill" to="red" dur="1s" fill="freeze" />
      </rect>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as any
    expect(rect.fill.type).toBe('solid')
    expect(rect.fill.color.toLowerCase()).toBe('#ff0000') // red normalized
  })

  it('applies <animateTransform type="translate" to="50,30">', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect id="r" x="10" y="10" width="20" height="20" fill="green">
        <animateTransform attributeName="transform" type="translate" to="50,30" dur="1s" fill="freeze" />
      </rect>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as ShapeElement
    expect(rect.transform).toBeDefined()
    expect((rect.transform as any).translateX).toBe(50)
    expect((rect.transform as any).translateY).toBe(30)
  })

  it('ignores animations when fill="remove" (default)', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect id="r" x="0" y="0" width="20" height="20" fill="blue">
        <animate attributeName="x" to="50" dur="1s" />
      </rect>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const rect = elements[0] as ShapeElement
    // fill="remove" (default) — animation is not frozen
    expect(rect.x).toBe(0)
  })
})

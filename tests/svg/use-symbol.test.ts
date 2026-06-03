// Tests for SVG `<use>` and `<symbol>` support.
//
// Behavior under test:
//   1. `<use href="#id">` instantiates the referenced defs entry as a
//      new child element, with absolute coordinates (per SIF rule).
//   2. `<use x y width height>` overrides the defs' bbox.
//   3. `<symbol viewBox>` is treated as a virtual nested `<svg>` — the
//      viewport matrix is applied to its children.
//   4. Multiple `<use>` of the same `<symbol>` produce independent
//      absolute-coordinate instances (no aliasing of x/y).
//   5. Unknown `href` is silently dropped (no throw).
//   6. `<use>` inside a `<g transform>` merges the parent transform.

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import type { ShapeElement, GroupElement } from '../../src/sif'

beforeEach(() => {
  resetIdCounter()
})

describe('SVG <use>', () => {
  it('instantiates a <use href="#rectId"> with absolute coordinates', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <rect id="myRect" x="0" y="0" width="20" height="20" fill="red" />
      </defs>
      <use href="#myRect" x="50" y="60" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    const shape = elements[0] as ShapeElement
    expect(shape.type).toBe('shape')
    expect(shape.shapeType).toBe('rect')
    expect(shape.x).toBeCloseTo(50, 1)
    expect(shape.y).toBeCloseTo(60, 1)
    expect(shape.width).toBeCloseTo(20, 1)
    expect(shape.height).toBeCloseTo(20, 1)
  })

  it('uses <use width height> to override the referenced element size', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <rect id="myRect" x="0" y="0" width="20" height="20" fill="red" />
      </defs>
      <use href="#myRect" x="10" y="20" width="80" height="40" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const shape = elements[0] as ShapeElement
    expect(shape.x).toBeCloseTo(10, 1)
    expect(shape.y).toBeCloseTo(20, 1)
    expect(shape.width).toBeCloseTo(80, 1)
    expect(shape.height).toBeCloseTo(40, 1)
  })

  it('supports xlink:href as a fallback href', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <circle id="myCircle" cx="0" cy="0" r="10" fill="blue" />
      </defs>
      <use xlink:href="#myCircle" x="100" y="100" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    const shape = elements[0] as ShapeElement
    expect(shape.shapeType).toBe('circle')
    // center at (100, 100) — circle's x is bounding-box top-left = 90
    expect(shape.x).toBeCloseTo(90, 1)
    expect(shape.y).toBeCloseTo(90, 1)
  })

  it('produces independent instances when <use> appears multiple times', () => {
    const svg = `<svg viewBox="0 0 400 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <rect id="r" width="30" height="30" fill="green" />
      </defs>
      <use href="#r" x="10"  y="10" />
      <use href="#r" x="100" y="10" />
      <use href="#r" x="200" y="10" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(3)
    const xs = elements.map(e => (e as ShapeElement).x)
    expect(xs).toEqual([10, 100, 200])
  })

  it('merges parent <g transform> into <use> placement', () => {
    const svg = `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <rect id="r" width="20" height="20" fill="black" />
      </defs>
      <g transform="translate(100, 50)">
        <use href="#r" x="10" y="10" />
      </g>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const shape = elements[0] as ShapeElement
    expect(shape.x).toBeCloseTo(110, 1)
    expect(shape.y).toBeCloseTo(60, 1)
  })

  it('silently drops a <use> with an unresolved href', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <use href="#doesNotExist" x="10" y="10" />
      <rect x="0" y="0" width="50" height="50" fill="red" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    // The unreachable <use> is dropped; the rect survives.
    expect(elements).toHaveLength(1)
    expect((elements[0] as ShapeElement).shapeType).toBe('rect')
  })

  it('supports <use> referencing a <symbol> with viewBox', () => {
    const svg = `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="icon" viewBox="0 0 32 32">
          <rect x="0" y="0" width="32" height="32" fill="orange" />
          <circle cx="16" cy="16" r="8" fill="white" />
        </symbol>
      </defs>
      <use href="#icon" x="10" y="10" width="100" height="100" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    // Two children inside the symbol — both must be positioned with the
    // symbol's viewport matrix applied.
    expect(elements.length).toBeGreaterThanOrEqual(2)
    const rect = elements.find(e => (e as ShapeElement).shapeType === 'rect') as ShapeElement
    expect(rect).toBeDefined()
    // 100x100 box at (10,10), inner 32x32 → scale 100/32 = 3.125
    expect(rect.x).toBeCloseTo(10, 0)
    expect(rect.y).toBeCloseTo(10, 0)
    expect(rect.width).toBeCloseTo(100, 0)
  })
})

describe('SVG <symbol> directly rendered (without <use>)', () => {
  it('does not emit elements for an unreferenced <symbol> in <defs>', () => {
    const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="orphan">
          <rect x="0" y="0" width="50" height="50" fill="red" />
        </symbol>
      </defs>
      <rect x="0" y="0" width="10" height="10" fill="blue" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    // Only the blue rect should be emitted; the orphan symbol stays in <defs>
    expect(elements).toHaveLength(1)
    expect((elements[0] as ShapeElement).fill).toMatchObject({ type: 'solid' })
  })
})

describe('SVG nested <use> in groups (preserveGroups=true)', () => {
  it('emits the <use> instantiated shape inside a group', () => {
    const svg = `<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <rect id="r" width="20" height="20" fill="purple" />
      </defs>
      <g transform="translate(50, 50)">
        <use href="#r" x="10" y="10" />
      </g>
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: true })
    expect(elements).toHaveLength(1)
    const group = elements[0] as GroupElement
    expect(group.type).toBe('group')
    expect(group.children).toHaveLength(1)
    const shape = group.children[0] as ShapeElement
    expect(shape.x).toBeCloseTo(60, 1)
    expect(shape.y).toBeCloseTo(60, 1)
  })
})

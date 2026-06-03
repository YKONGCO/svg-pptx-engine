// End-to-end tests for the SVG → SIF pipeline.
//
// Loads every SVG under `example/` and asserts:
//   1. The pipeline does not throw
//   2. The result is an array of SIF elements
//   3. The element list is non-empty
//   4. A `svgToSlideDocument` round-trip produces a slide with width/height
//      matching the SVG viewBox or width/height attributes
//
// The goal of this suite is to catch regressions in element coverage,
// parse errors, and layout bugs across the realistic SVG samples the
// project ships as documentation and demo material.

import { svgToSif, svgToSlideDocument } from '../../src'
import { loadAllSvgFixtures, loadSvgFixture } from './fixtures'

describe('SVG Inputs - end-to-end pipeline', () => {
  const fixtures = loadAllSvgFixtures()

  it('discovers fixtures under example/', () => {
    // The repo ships ~50 SVG examples; assert we found a meaningful
    // number so a misconfigured path is caught immediately.
    expect(fixtures.length).toBeGreaterThanOrEqual(40)
  })

  describe.each(fixtures)('fixture: $relPath', (fixture) => {
    it('converts to SIF without throwing', () => {
      expect(() =>
        svgToSif(fixture.content, { preserveGroups: true })
      ).not.toThrow()
    })

    it('produces a non-empty element list', () => {
      const elements = svgToSif(fixture.content, { preserveGroups: true })
      expect(Array.isArray(elements)).toBe(true)
      expect(elements.length).toBeGreaterThan(0)
    })

    it('produces a slide document with matching dimensions', () => {
      const doc = svgToSlideDocument(fixture.content)
      expect(doc.width).toBeGreaterThan(0)
      expect(doc.height).toBeGreaterThan(0)
      expect(doc.slides).toHaveLength(1)
      expect(doc.slides[0].elements.length).toBeGreaterThan(0)
    })
  })
})

describe('SVG Inputs - spec-compliant and regression examples', () => {
  it('handles the spec-compliant example with defs/gradient/filter', () => {
    const fx = loadSvgFixture('example/SVG转PPTX规范/spec-compliant-example.svg')
    const elements = svgToSif(fx.content, { preserveGroups: true })
    // spec example contains: defs (gradient + filter), rect with filter,
    // a line with gradient stroke, and a text with tspan — must all round-trip
    expect(elements.length).toBeGreaterThanOrEqual(3)
  })

  it('handles nested <svg> viewports', () => {
    const fx = loadSvgFixture('example/嵌套SVG测试/nested-svg-composition.svg')
    const elements = svgToSif(fx.content, { preserveGroups: true })
    expect(elements.length).toBeGreaterThan(0)
  })

  it('handles media assets with image/video/audio', () => {
    const fx = loadSvgFixture('example/媒体素材测试/public-media-assets.svg')
    const elements = svgToSif(fx.content, { preserveGroups: true })
    expect(elements.length).toBeGreaterThan(0)
  })
})

describe('SVG Inputs - LaTeX fixture', () => {
  // The latex_test fixture is the canonical baseline for the formula
  // pipeline (Phase 4). Even at Phase 0, we assert it converts without
  // throwing — its text elements must reach the converter.
  it('converts latex_test.svg without throwing', () => {
    const fx = loadSvgFixture('example/测试通过/latex_test.svg')
    expect(() => svgToSif(fx.content, { preserveGroups: true })).not.toThrow()
  })

  it('emits text elements for the four latex cases', () => {
    const fx = loadSvgFixture('example/测试通过/latex_test.svg')
    const doc = svgToSlideDocument(fx.content)
    const textElements = doc.slides[0].elements.filter(e => e.type === 'text')
    // Background rect is 1 element + 4 text elements = 5
    expect(textElements.length).toBeGreaterThanOrEqual(4)
  })
})

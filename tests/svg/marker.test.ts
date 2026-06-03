// Tests for SVG `<marker>` element support.
//
// Phase 1.2 goals:
//   1. <marker> definitions in <defs> are recognized and indexed.
//   2. <line marker-start/end> resolves the marker id to a structured
//      ArrowMarker (type + color + size), not a string.
//   3. When the marker is named "diamond"/"circle"/etc., the type
//      is inferred from the id (backward compat with the existing
//      name-based heuristic).
//   4. marker-mid is supported and emitted on the SIF LineElement.

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import type { LineElement, ArrowMarker } from '../../src/sif'

beforeEach(() => {
  resetIdCounter()
})

/** Coerce a `MarkerAttr` (string or ArrowMarker) to an ArrowMarker. */
function asMarker(m: LineElement['markerStart']): ArrowMarker {
  if (typeof m === 'string') return { id: m, type: m as ArrowMarker['type'] }
  return m!
}

describe('SVG <marker> resolution', () => {
  it('resolves marker-start="url(#arrowEnd)" to ArrowMarker type=arrow', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrowEnd" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="black" />
        </marker>
      </defs>
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" marker-end="url(#arrowEnd)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    expect(elements).toHaveLength(1)
    const line = elements[0] as LineElement
    expect(line.type).toBe('line')
    expect(line.markerEnd).toBeDefined()
    expect(asMarker(line.markerEnd).type).toBe('arrow')
  })

  it('detects marker type from id when marker is unreferenced', () => {
    // marker-start references a missing id; we keep the legacy name
    // heuristic so existing fixtures don't break.
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" marker-end="url(#diamondArrow)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const line = elements[0] as LineElement
    expect(line.markerEnd).toBeDefined()
    expect(asMarker(line.markerEnd).type).toBe('diamond')
  })

  it('reads refX/refY/markerWidth/markerHeight/orient from <marker>', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="custom" refX="3" refY="4" markerWidth="10" markerHeight="8" orient="auto">
          <circle cx="3" cy="4" r="2" fill="red" />
        </marker>
      </defs>
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" marker-end="url(#custom)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const line = elements[0] as LineElement
    expect(asMarker(line.markerEnd)).toMatchObject({
      id: 'custom',
      refX: 3,
      refY: 4,
      width: 10,
      height: 8,
      orient: 'auto',
    })
  })

  it('emits markerStart when marker-start attribute is set', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="start" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M10,0 L0,5 L10,10 z" fill="black" />
        </marker>
      </defs>
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" marker-start="url(#start)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const line = elements[0] as LineElement
    expect(line.markerStart).toBeDefined()
    expect(asMarker(line.markerStart).type).toBe('arrow')
  })

  it('emits markerMid when marker-mid attribute is set', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="mid" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <circle cx="5" cy="5" r="3" fill="green" />
        </marker>
      </defs>
      <polyline points="10,10 100,50 190,10" stroke="black" fill="none" stroke-width="2" marker-mid="url(#mid)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const polyline = elements[0] as LineElement
    expect(polyline.markerMid).toBeDefined()
    expect(polyline.markerMid!.type).toBe('arrow')
  })

  it('preserves line.markerStart and markerEnd on a single line with both', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="head" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="black" />
        </marker>
        <marker id="tail" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M10,0 L0,5 L10,10 z" fill="black" />
        </marker>
      </defs>
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" marker-start="url(#tail)" marker-end="url(#head)" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const line = elements[0] as LineElement
    expect(line.markerStart).toBeDefined()
    expect(line.markerEnd).toBeDefined()
  })

  it('returns undefined for markerStart when no marker-start attribute', () => {
    const svg = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="100" x2="200" y2="100" stroke="black" stroke-width="2" />
    </svg>`

    const elements = svgToSif(svg, { preserveGroups: false })
    const line = elements[0] as LineElement
    expect(line.markerStart).toBeUndefined()
    expect(line.markerEnd).toBeUndefined()
  })
})

import { convertMask } from './mask'
import type { LinearGradient } from '../../sif/types/style/gradient'

const linearGradientMap = new Map<string, LinearGradient>([
  ['mask-grad', {
    type: 'linear',
    stops: [
      { offset: 0, color: '#ffffff', opacity: 1 },
      { offset: 1, color: '#000000', opacity: 1 }
    ],
    x1: 0, y1: 0, x2: 1, y2: 0
  }]
])

describe('convertMask', () => {
  it('captures solid white mask with full opacity', () => {
    const def = {
      rect: { '@_x': '0', '@_y': '0', '@_width': '240', '@_height': '160', '@_fill': 'white' }
    }
    const r = convertMask(def, 'm1')
    expect(r).toBeDefined()
    expect(r?.color).toBe('white')
    expect(r?.opacity).toBe(1)
    expect(r?.gradient).toBeUndefined()
  })

  it('captures solid black mask (zero visibility)', () => {
    const def = {
      rect: { '@_x': '0', '@_y': '0', '@_width': '240', '@_height': '160', '@_fill': 'black' }
    }
    const r = convertMask(def, 'm2')
    expect(r?.color).toBe('black')
    expect(r?.gradient).toBeUndefined()
  })

  it('captures fill-opacity into mask opacity', () => {
    const def = {
      rect: { '@_x': '0', '@_y': '0', '@_width': '240', '@_height': '160', '@_fill': 'white', '@_fill-opacity': '0.4' }
    }
    const r = convertMask(def, 'm3')
    expect(r?.opacity).toBeCloseTo(0.4)
  })

  it('resolves url(#mask-grad) to a gradient definition with stops', () => {
    // 02-mask-alpha.svg panel 5 — the "fade out" pattern.
    const def = {
      rect: { '@_x': '0', '@_y': '0', '@_width': '240', '@_height': '160', '@_fill': 'url(#mask-grad)' }
    }
    const r = convertMask(def, 'm4', linearGradientMap)
    expect(r).toBeDefined()
    expect(r?.color).toBe('url(#mask-grad)')
    expect(r?.gradient).toBeDefined()
    expect(r?.gradient?.type).toBe('linear')
    // x1=0% y1=0% x2=100% y2=0% (left→right) maps to 0° in the
    // PowerPoint angle convention (0 = horizontal left→right,
    // increasing clockwise). pptxgenjs emits this as <a:lin ang="0"/>.
    expect(r?.gradient?.angle).toBe(0)
    expect(r?.gradient?.stops).toHaveLength(2)
    expect(r?.gradient?.stops[0].color).toBe('#ffffff')
    expect(r?.gradient?.stops[1].color).toBe('#000000')
  })

  it('falls back to solid-color semantics when gradient ref is unresolvable', () => {
    const def = {
      rect: { '@_x': '0', '@_y': '0', '@_width': '240', '@_height': '160', '@_fill': 'url(#unknown)' }
    }
    const r = convertMask(def, 'm5', linearGradientMap)
    expect(r?.gradient).toBeUndefined()
    expect(r?.color).toBe('url(#unknown)')
  })

  it('warns and returns undefined for multi-rect masks', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const def = {
      rect: [
        { '@_x': '0', '@_y': '0', '@_width': '120', '@_height': '80', '@_fill': 'white' },
        { '@_x': '120', '@_y': '0', '@_width': '120', '@_height': '80', '@_fill': 'black' }
      ]
    }
    const r = convertMask(def, 'm6', linearGradientMap)
    expect(r).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

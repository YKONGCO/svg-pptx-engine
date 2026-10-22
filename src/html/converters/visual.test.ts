// Tests for src/html/converters/visual.ts
//
// ReadFill / readBackground / readStroke / readEffect /
// readTransform / normalizeColor — the converters that turn CSS
// computed values into SIF visual primitives.

import { readInlineFill, readFill, readBackground, readStroke, readBorderRadius, readEffect, readTransform, normalizeColor } from './visual'

describe('normalizeColor', () => {
  it('uppercases 6-digit hex', () => {
    expect(normalizeColor('#ff0000')).toBe('#FF0000')
  })
  it('expands 3-digit hex', () => {
    expect(normalizeColor('#abc')).toBe('#AABBCC')
  })
  it('keeps rgb() as 6-digit hex', () => {
    expect(normalizeColor('rgb(255, 0, 0)')).toBe('#FF0000')
  })
  it('adds alpha channel for rgba()', () => {
    expect(normalizeColor('rgba(0, 0, 0, 0.5)')).toBe('#00000080')
  })
  it('handles named colors', () => {
    expect(normalizeColor('red')).toBe('#FF0000')
  })
})

describe('readInlineFill', () => {
  it('returns a solid fill', () => {
    expect(readInlineFill('red')).toEqual({ type: 'solid', color: '#FF0000' })
  })
  it('falls back to the raw value when unparseable', () => {
    // Anything that's not a recognised color is passed through verbatim.
    expect(readInlineFill('not-a-color')).toEqual({ type: 'solid', color: 'not-a-color' })
  })
})

describe('readFill', () => {
  it('reads `color` from the style', () => {
    const style = new Map([['color', '#123456']])
    expect(readFill(style)).toEqual({ type: 'solid', color: '#123456' })
  })
  it('falls back to default when missing', () => {
    expect(readFill(new Map())).toEqual({ type: 'solid', color: '#000000' })
  })
})

describe('readBackground', () => {
  it('returns undefined for "none"', () => {
    expect(readBackground(new Map([['background', 'none']]))).toBeUndefined()
  })
  it('returns undefined for transparent', () => {
    expect(readBackground(new Map([['background-color', 'transparent']]))).toBeUndefined()
  })
  it('reads solid background-color', () => {
    const bg = readBackground(new Map([['background-color', '#fafafa']]))
    expect(bg).toEqual({ type: 'solid', color: '#FAFAFA' })
  })
  it('parses linear-gradient', () => {
    const bg = readBackground(new Map([['background-image', 'linear-gradient(45deg, #ff0000, #00ff00)']]))
    expect(bg?.type).toBe('gradient')
    if (bg?.type === 'gradient') {
      expect((bg.gradient as any).type).toBe('linear')
      expect((bg.gradient as any).stops.length).toBe(2)
    }
  })
})

describe('readStroke', () => {
  it('returns undefined when border-width is 0', () => {
    expect(readStroke(new Map())).toBeUndefined()
  })
  it('reads border shorthand', () => {
    const s = readStroke(new Map([['border', '2px solid #abcdef']]))
    expect(s?.color).toBe('#ABCDEF')
    expect(s?.width).toBe(2)
  })
  it('reads longhand border-top-width', () => {
    const s = readStroke(new Map([
      ['border-top-width', '3px'],
      ['border-color', '#000'],
      ['border-style', 'solid'],
    ]))
    expect(s?.width).toBe(3)
    expect(s?.color).toBe('#000000')
  })
  it('skips when border-style is none', () => {
    expect(readStroke(new Map([
      ['border', '1px none #000'],
    ]))).toBeUndefined()
  })
})

describe('readBorderRadius', () => {
  it('returns undefined when missing', () => {
    expect(readBorderRadius(new Map())).toBeUndefined()
  })
  it('reads single value', () => {
    expect(readBorderRadius(new Map([['border-radius', '8px']]))).toEqual({ rx: 8, ry: 8 })
  })
  it('reads em units', () => {
    expect(readBorderRadius(new Map([['border-radius', '0.5em']]))).toEqual({ rx: 8, ry: 8 })
  })
})

describe('readEffect', () => {
  it('returns undefined when missing', () => {
    expect(readEffect(new Map())).toBeUndefined()
  })
  it('returns undefined for "none"', () => {
    expect(readEffect(new Map([['box-shadow', 'none']]))).toBeUndefined()
  })
  it('parses box-shadow into a ShadowEffect', () => {
    const e = readEffect(new Map([['box-shadow', '0 4px 12px rgba(0,0,0,0.06)']]))
    expect(e?.type).toBe('shadow')
    if (e?.type === 'shadow') {
      expect(e.offsetX).toBe(0)
      expect(e.offsetY).toBe(4)
      expect(e.blur).toBe(12)
      // Alpha < 1 emits an 8-digit hex so the renderer's transparency
      // survives.
      expect(e.color).toBe('#0000000F')
    }
  })
  it('parses text-shadow too', () => {
    const e = readEffect(new Map([['text-shadow', '1px 1px 2px #999']]))
    expect(e?.type).toBe('shadow')
  })
})

describe('readTransform', () => {
  it('returns undefined when transform is none', () => {
    expect(readTransform(new Map([['transform', 'none']]))).toBeUndefined()
  })
  it('parses translate(x, y)', () => {
    expect(readTransform(new Map([['transform', 'translate(10px, 20px)']]))).toEqual({ translateX: 10, translateY: 20 })
  })
  it('parses rotate()', () => {
    expect(readTransform(new Map([['transform', 'rotate(45deg)']]))).toEqual({ rotate: 45 })
  })
  it('parses scale(x, y)', () => {
    expect(readTransform(new Map([['transform', 'scale(2, 0.5)']]))).toEqual({ scaleX: 2, scaleY: 0.5 })
  })
})
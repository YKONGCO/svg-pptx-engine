// Tests for src/html/css/units.ts
//
// CSS unit conversion → px. SIF (and PPTX) use px as the only
// length unit, so every value coming out of the cascade must be
// resolved to a number in px before it lands on a SIF element.

import { toPx, parseLength, isLength, parseColor } from './units'

describe('toPx', () => {
  it('passes through px unchanged', () => {
    expect(toPx('16px')).toBe(16)
    expect(toPx('0px')).toBe(0)
    expect(toPx('1280.5px')).toBe(1280.5)
  })

  it('converts em based on baseFontSize (default 16)', () => {
    expect(toPx('1em')).toBe(16)
    expect(toPx('1.5em')).toBe(24)
    expect(toPx('2em', { baseFontSize: 14 })).toBe(28)
  })

  it('converts rem based on baseFontSize', () => {
    expect(toPx('1rem')).toBe(16)
    expect(toPx('0.875rem')).toBe(14)
  })

  it('converts pt (1pt = 4/3 px)', () => {
    expect(toPx('12pt')).toBe(16)
    expect(toPx('9pt')).toBe(12)
  })

  it('converts unitless numbers as px (for line-height: 1.5 etc.)', () => {
    expect(toPx('1.5')).toBe(1.5)
    expect(toPx('0')).toBe(0)
  })

  it('returns NaN for non-length tokens (colors, keywords)', () => {
    expect(Number.isNaN(toPx('red'))).toBe(true)
    expect(Number.isNaN(toPx('auto'))).toBe(true)
    expect(Number.isNaN(toPx('100%'))).toBe(true)
  })

  it('handles negative values', () => {
    expect(toPx('-8px')).toBe(-8)
    expect(toPx('-1em')).toBe(-16)
  })

  it('handles zero without unit (0)', () => {
    expect(toPx('0')).toBe(0)
    expect(toPx('0px')).toBe(0)
  })

  it('returns NaN for empty string', () => {
    expect(Number.isNaN(toPx(''))).toBe(true)
  })
})

describe('parseLength', () => {
  it('returns { value, unit } for a length', () => {
    expect(parseLength('16px')).toEqual({ value: 16, unit: 'px' })
    expect(parseLength('1.5em')).toEqual({ value: 1.5, unit: 'em' })
    expect(parseLength('50%')).toEqual({ value: 50, unit: '%' })
  })

  it('treats unitless numbers as px', () => {
    expect(parseLength('0')).toEqual({ value: 0, unit: 'px' })
    expect(parseLength('1.5')).toEqual({ value: 1.5, unit: 'px' })
  })
})

describe('isLength', () => {
  it('returns true for px/em/rem/pt values', () => {
    expect(isLength('16px')).toBe(true)
    expect(isLength('1em')).toBe(true)
    expect(isLength('0.875rem')).toBe(true)
    expect(isLength('12pt')).toBe(true)
  })

  it('returns false for colors, keywords, percentages', () => {
    expect(isLength('red')).toBe(false)
    expect(isLength('auto')).toBe(false)
    expect(isLength('50%')).toBe(false)
  })
})

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ff0000')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('#4F46E5')).toEqual({ kind: 'rgb', r: 79, g: 70, b: 229, a: 1 })
  })

  it('parses 3-digit hex', () => {
    expect(parseColor('#f00')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('#4f4')).toEqual({ kind: 'rgb', r: 68, g: 255, b: 68, a: 1 })
  })

  it('parses 8-digit hex (with alpha)', () => {
    expect(parseColor('#ff000080')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 128 / 255 })
  })

  it('parses rgb() function', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('rgb(50%, 50%, 50%)')).toEqual({ kind: 'rgb', r: 127.5, g: 127.5, b: 127.5, a: 1 })
  })

  it('parses rgba() function', () => {
    expect(parseColor('rgba(255, 0, 0, 0.5)')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 0.5 })
  })

  it('parses hsl() function', () => {
    const c = parseColor('hsl(0, 100%, 50%)')!
    expect(c.kind).toBe('rgb')
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
  })

  it('parses named colors (common ones)', () => {
    expect(parseColor('red')).toEqual({ kind: 'rgb', r: 255, g: 0, b: 0, a: 1 })
    expect(parseColor('blue')).toEqual({ kind: 'rgb', r: 0, g: 0, b: 255, a: 1 })
    expect(parseColor('white')).toEqual({ kind: 'rgb', r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('black')).toEqual({ kind: 'rgb', r: 0, g: 0, b: 0, a: 1 })
    expect(parseColor('transparent')).toEqual({ kind: 'rgb', r: 0, g: 0, b: 0, a: 0 })
  })

  it('returns undefined for unknown values', () => {
    expect(parseColor('not-a-color')).toBeUndefined()
    expect(parseColor('')).toBeUndefined()
  })
})

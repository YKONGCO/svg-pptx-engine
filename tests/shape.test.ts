// Tests for shape converter

import { convertShape, convertFill, convertStrokeDef, convertEffect } from '../src/pptx/converters/shape'
import { createMockRectShape, createMockCircleShape, createMockEllipseShape, createMockSolidFill, createMockSolidStroke, createMockGradientFill, createMockShadowEffect } from './mockData'

describe('Shape Converter', () => {
  describe('convertShape', () => {
    it('should convert rectangle shape', () => {
      const rect = createMockRectShape()
      const result = convertShape(rect)

      expect(result.shapeName).toBe('rect')
      expect(result.options.x).toBeCloseTo(1.0417, 2)
      expect(result.options.y).toBeCloseTo(1.0417, 2)
      expect(result.options.w).toBeCloseTo(2.0833, 2)
      expect(result.options.h).toBeCloseTo(1.0417, 2)
    })

    it('should convert circle shape', () => {
      const circle = createMockCircleShape()
      const result = convertShape(circle)

      expect(result.shapeName).toBe('ellipse')
    })

    it('should convert ellipse shape', () => {
      const ellipse = createMockEllipseShape()
      const result = convertShape(ellipse)

      expect(result.shapeName).toBe('ellipse')
    })

    it('should apply rotation transform', () => {
      const rect = createMockRectShape({
        transform: { rotate: 45 }
      })
      const result = convertShape(rect)

      expect(result.options.rotate).toBe(45)
    })
  })

  describe('convertFill', () => {
    it('should convert solid fill', () => {
      const fill = createMockSolidFill()
      const result = convertFill(fill)

      expect(result.type).toBe('solid')
      // Cast to access solid fill properties
      const solidResult = result as { type: 'solid'; color: string; transparency: number }
      expect(solidResult.color).toBe('FF5733')
    })

    it('should convert gradient fill', () => {
      const fill = createMockGradientFill()
      const result = convertFill(fill)

      expect(result).toBeDefined()
      expect(result.type).toBe('linearGradient')
    })
  })

  describe('convertStrokeDef', () => {
    it('should convert solid stroke', () => {
      const stroke = createMockSolidStroke()
      const result = convertStrokeDef(stroke)

      expect(result).toBeDefined()
      expect(result?.color).toBe('000000')
    })
  })

  describe('convertEffect', () => {
    it('should convert shadow effect', () => {
      const effect = createMockShadowEffect()
      const result = convertEffect(effect)

      expect(result).toBeDefined()
      expect(result?.type).toBe('outer')
      expect(result?.color).toBe('000000')
    })

    it('should return undefined for undefined effect', () => {
      const result = convertEffect(undefined)
      expect(result).toBeUndefined()
    })
  })
})

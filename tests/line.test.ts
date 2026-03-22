// Tests for line converter

import { convertLine, convertArrowMarker } from '../src/pptx/converters/line'
import { createMockGradientStroke, createMockLineElement } from './mockData'

describe('Line Converter', () => {
  describe('convertLine', () => {
    it('should convert basic line element', () => {
      const line = createMockLineElement()
      const result = convertLine(line)

      expect(result.shapeName).toBe('custGeom')
      expect(result.options.x).toBeCloseTo(1.0417, 2)
      expect(result.options.y).toBeCloseTo(1.0417, 2)
      expect(result.options.points).toBeDefined()
    })

    it('should convert line with stroke', () => {
      const line = createMockLineElement()
      const result = convertLine(line)

      expect(result.options.line).toBeDefined()
      expect(result.options.line?.type).toBe('solid')
      if (result.options.line && result.options.line.type !== 'linearGradient' && result.options.line.type !== 'none') {
        expect(result.options.line.color).toBe('FF00FF')
      }
    })

    it('should convert scatter-style dash arrays to dashed ppt lines', () => {
      const line = createMockLineElement({
        stroke: {
          type: 'solid',
          color: '2196F3',
          width: 2,
          dashArray: '8,4'
        }
      })
      const result = convertLine(line)

      expect(result.options.line?.dashType).toBe('lgDash')
    })

    it('should convert gradient stroke lines to pptx linearGradient line props', () => {
      const line = createMockLineElement({
        opacity: 0.8,
        stroke: createMockGradientStroke({
          width: 4,
          gradient: {
            type: 'linear',
            angle: 60,
            stops: [
              { color: '00FFAA', offset: 0, opacity: 1 },
              { color: '0044FF', offset: 1, opacity: 0.6 }
            ]
          }
        })
      })
      const result = convertLine(line)

      expect(result.options.line).toBeDefined()
      expect(result.options.line?.type).toBe('linearGradient')
      if (result.options.line && result.options.line.type === 'linearGradient') {
        expect(result.options.line.angle).toBe(60)
        expect(result.options.line.stops).toHaveLength(2)
        expect(result.options.line.stops[0].color).toBe('00FFAA')
        expect(result.options.line.stops[1].color).toBe('0044FF')
        expect(result.options.line.stops[1].transparency).toBeGreaterThan(0)
      }
    })
  })

  describe('convertArrowMarker', () => {
    it('should convert arrow marker', () => {
      const result = convertArrowMarker({ id: 'arrow-1', type: 'arrow' })
      expect(result).toBe('arrow')
    })

    it('should convert diamond marker', () => {
      const result = convertArrowMarker({ id: 'diamond-1', type: 'diamond' })
      expect(result).toBe('diamond')
    })

    it('should convert circle marker', () => {
      const result = convertArrowMarker({ id: 'circle-1', type: 'circle' })
      expect(result).toBe('oval')
    })
  })
})

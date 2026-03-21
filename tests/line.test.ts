// Tests for line converter

import { convertLine, convertArrowMarker } from '../src/pptx/converters/line'
import { createMockLineElement } from './mockData'

describe('Line Converter', () => {
  describe('convertLine', () => {
    it('should convert basic line element', () => {
      const line = createMockLineElement()
      const result = convertLine(line)

      expect(result.shapeName).toBe('line')
      expect(result.options.x).toBeCloseTo(1.0417, 2)
      expect(result.options.y).toBeCloseTo(1.0417, 2)
    })

    it('should convert line with stroke', () => {
      const line = createMockLineElement()
      const result = convertLine(line)

      expect(result.options.line).toBeDefined()
      expect(result.options.line?.color).toBe('FF00FF')
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

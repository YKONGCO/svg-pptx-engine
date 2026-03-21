// Tests for image converter

import { convertImage } from '../src/pptx/converters/image'
import { createMockImageElement, createMockBase64ImageElement } from './mockData'

describe('Image Converter', () => {
  describe('convertImage', () => {
    it('should convert basic image element', () => {
      const image = createMockImageElement()
      const result = convertImage(image)

      expect(result.x).toBeCloseTo(2.6042, 2)
      expect(result.y).toBeCloseTo(2.6042, 2)
      expect(result.w).toBeCloseTo(3.125, 2)
      expect(result.h).toBeCloseTo(2.0833, 2)
      expect(result.path).toBe('https://example.com/image.png')
    })

    it('should handle base64 images', () => {
      const image = createMockBase64ImageElement()
      const result = convertImage(image)

      expect(result.data).toBeDefined()
    })

    it('should handle preserveAspectRatio', () => {
      const image = createMockImageElement({ preserveAspectRatio: true })
      const result = convertImage(image)

      expect(result.sizing).toBeDefined()
    })

    it('should handle flip horizontal', () => {
      const image = createMockImageElement({ flipH: true })
      const result = convertImage(image)

      expect(result.flipH).toBe(true)
    })

    it('should handle flip vertical', () => {
      const image = createMockImageElement({ flipV: true })
      const result = convertImage(image)

      expect(result.flipV).toBe(true)
    })

    it('should handle rotation transform', () => {
      const image = createMockImageElement({
        transform: { rotate: 45 }
      })
      const result = convertImage(image)

      expect(result.rotate).toBe(45)
    })
  })
})

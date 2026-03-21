// Tests for slide converter

import { convertSlideBackground, getElementsInRenderOrder, convertElement, convertGroupElements } from '../src/pptx/converters/slide'
import { createMockSlide, createMockSlideBackground, createMockSolidFill, createMockGradientFill, createMockRectShape, createMockTextElement, createMockGroupElement, createMockImageElement, createMockLineElement, createMockVideoElement } from './mockData'

describe('Slide Converter', () => {
  describe('convertSlideBackground', () => {
    it('should convert solid fill background', () => {
      const background = createMockSlideBackground({
        fill: createMockSolidFill({ color: 'FF5733' })
      })
      const result = convertSlideBackground(background)

      expect(result).toBeDefined()
      expect(result?.color).toBe('FF5733')
      expect(result?.type).toBe('solid')
    })

    it('should convert gradient fill background', () => {
      const background = createMockSlideBackground({
        fill: createMockGradientFill()
      })
      const result = convertSlideBackground(background) as any

      // Gradient now returns linearGradient type with stops
      expect(result?.type).toBe('linearGradient')
      expect(result?.stops).toBeDefined()
      expect(result?.stops?.length).toBeGreaterThan(0)
    })

    it('should return undefined for undefined background', () => {
      const result = convertSlideBackground(undefined)
      expect(result).toBeUndefined()
    })

    it('should handle transparency', () => {
      const background = createMockSlideBackground({
        fill: createMockSolidFill({ color: 'FF5733', opacity: 0.5 })
      })
      const result = convertSlideBackground(background)

      expect(result?.transparency).toBe(50)
    })
  })

  describe('getElementsInRenderOrder', () => {
    it('should sort elements by zIndex', () => {
      const elements = [
        { id: 'a', zIndex: 3 } as any,
        { id: 'b', zIndex: 1 } as any,
        { id: 'c', zIndex: 2 } as any
      ]

      const result = getElementsInRenderOrder(elements)

      expect(result[0].id).toBe('b')
      expect(result[1].id).toBe('c')
      expect(result[2].id).toBe('a')
    })

    it('should handle missing zIndex (default to 0)', () => {
      const elements = [
        { id: 'a' } as any,
        { id: 'b', zIndex: 1 } as any
      ]

      const result = getElementsInRenderOrder(elements)

      expect(result[0].id).toBe('a')
      expect(result[1].id).toBe('b')
    })

    it('should not modify original array', () => {
      const elements = [
        { id: 'a', zIndex: 2 } as any,
        { id: 'b', zIndex: 1 } as any
      ]
      const original = [...elements]

      getElementsInRenderOrder(elements)

      expect(elements).toEqual(original)
    })
  })

  describe('convertElement', () => {
    it('should convert shape element', () => {
      const shape = createMockRectShape()
      const result = convertElement(shape)

      expect(result?.type).toBe('shape')
      expect(result?.data).toBeDefined()
    })

    it('should convert text element', () => {
      const text = createMockTextElement()
      const result = convertElement(text)

      expect(result?.type).toBe('text')
      expect(result?.data.text).toBe('Hello World')
    })

    it('should convert image element', () => {
      const image = createMockImageElement()
      const result = convertElement(image)

      expect(result?.type).toBe('image')
      expect(result?.data).toBeDefined()
    })

    it('should convert line element', () => {
      const line = createMockLineElement()
      const result = convertElement(line)

      expect(result?.type).toBe('line')
      expect(result?.data).toBeDefined()
    })

    it('should convert video element', () => {
      const video = createMockVideoElement()
      const result = convertElement(video)

      expect(result?.type).toBe('video')
      expect(result?.data).toBeDefined()
    })

    it('should return null for group element', () => {
      const group = createMockGroupElement()
      const result = convertElement(group)

      expect(result).toBeNull()
    })

    it('should return null for invisible elements', () => {
      const shape = createMockRectShape({ visible: false })
      const result = convertElement(shape)

      expect(result).toBeNull()
    })

    it('should warn for unsupported element types', () => {
      const unknown = { type: 'unknown' } as any
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      const result = convertElement(unknown)

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('convertGroupElements', () => {
    it('should flatten group children', () => {
      const group = createMockGroupElement()
      const result = convertGroupElements(group)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should return empty array for empty group', () => {
      const group: any = {
        type: 'group',
        id: 'empty',
        children: []
      }
      const result = convertGroupElements(group)

      expect(result).toEqual([])
    })
  })
})

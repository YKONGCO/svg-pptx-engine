// Tests for text converter

import { convertText, convertRichText, convertTextFill } from '../src/pptx/converters/text'
import { createMockTextElement, createMockRichTextElement, createMockSolidFill } from './mockData'

describe('Text Converter', () => {
  describe('convertText', () => {
    it('should convert basic text element', () => {
      const text = createMockTextElement()
      const result = convertText(text)

      expect(result.text).toBe('Hello World')
      expect(result.options.fontFace).toBe('Arial')
      expect(result.options.fontSize).toBe(18) // 24px = 18pt
      expect(result.options.bold).toBe(false)
      expect(result.options.italic).toBe(false)
      expect(result.options.color).toBe('000000')
    })

    it('should handle bold font weight', () => {
      const text = createMockTextElement({ fontWeight: 'bold' })
      const result = convertText(text)

      expect(result.options.bold).toBe(true)
    })

    it('should handle italic font style', () => {
      const text = createMockTextElement({ fontStyle: 'italic' })
      const result = convertText(text)

      expect(result.options.italic).toBe(true)
    })

    it('should handle center alignment', () => {
      const text = createMockTextElement({ textAlign: 'center' })
      const result = convertText(text)

      expect(result.options.align).toBe('center')
    })

    it('should handle vertical alignment', () => {
      const text = createMockTextElement({ verticalAlign: 'middle' })
      const result = convertText(text)

      expect(result.options.valign).toBe('middle')
    })

    it('should use SIF text box y directly', () => {
      const text = createMockTextElement({
        y: 100,
        fontSize: 20,
        verticalAlign: undefined
      })
      const result = convertText(text)

      expect(result.options.y).toBeCloseTo(100 / 96, 4)
    })

    it('should handle line height', () => {
      const text = createMockTextElement({ lineHeight: 36 })
      const result = convertText(text)

      expect(result.options.lineSpacingMultiple).toBe(1.5)
    })

    it('should handle text rotation', () => {
      const text = createMockTextElement({ textRotation: 90 })
      const result = convertText(text)

      expect(result.options.vert).toBe('vert')
    })

    it('should handle opacity', () => {
      const text = createMockTextElement({ opacity: 0.5 })
      const result = convertText(text)

      expect(result.options.transparency).toBe(50)
    })

    it('should handle transform rotation', () => {
      const text = createMockTextElement({
        transform: { rotate: 45 }
      })
      const result = convertText(text)

      expect(result.options.rotate).toBe(45)
    })
  })

  describe('convertRichText', () => {
    it('should handle element with runs', () => {
      const text = createMockRichTextElement()
      const result = convertRichText(text)

      expect(result).toHaveLength(2)
      expect(result[0].text).toBe('Bold ')
      expect(result[0].options.bold).toBe(true)
    })
  })

  describe('convertTextFill', () => {
    it('should convert solid fill', () => {
      const fill = createMockSolidFill()
      const result = convertTextFill(fill)

      expect(result).toBe('FF5733')
    })

    it('should convert gradient fill (uses first stop)', () => {
      const fill = {
        type: 'gradient',
        gradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { color: 'FF0000', offset: 0 },
            { color: '00FF00', offset: 1 }
          ]
        }
      }
      const result = convertTextFill(fill as any)

      expect(result).toBe('FF0000')
    })
  })
})

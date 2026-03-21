// Tests for text converter

import { convertText, convertRichText, convertTextFill, convertTextOrFormula } from '../src/pptx/converters/text'
import { createMockTextElement, createMockRichTextElement, createMockSolidFill } from './mockData'
import { __private__latexToMathML, convertTextToFormula, mathMLToOmml } from '../src/pptx/utils/formula'

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

  describe('formula conversion', () => {
    it('should detect latex block text and convert to formula', () => {
      const text = createMockTextElement({ text: '$x^2$' })
      const result = convertTextOrFormula(text)

      expect(result.type).toBe('formula')
      if (result.type === 'formula') {
        expect(result.options.omml).toContain('<m:sSup>')
      }
    })

    it('should convert common latex constructs to mathml', () => {
      const mathml = __private__latexToMathML('\\frac{a_1}{b^2}')

      expect(mathml).toContain('<mfrac>')
      expect(mathml).toContain('<msub>')
      expect(mathml).toContain('<msup>')
    })

    it('should convert mathml to omml', () => {
      const omml = mathMLToOmml('<math><mfrac><mi>x</mi><mn>2</mn></mfrac></math>')

      expect(omml).toContain('<m:oMath')
      expect(omml).toContain('<m:f>')
      expect(omml).toContain('<m:num>')
    })

    it('should keep plain text on mixed content', () => {
      const text = createMockTextElement({ text: '面积 $x^2$' })
      const result = convertTextOrFormula(text)

      expect(result.type).toBe('fragments')
    })

    it('should split inline text and formula fragments', () => {
      const text = createMockTextElement({
        text: 'The Quadratic Formula: $x=\\frac{-b}{2a}$'
      })
      const result = convertTextOrFormula(text)

      expect(result.type).toBe('fragments')
      if (result.type === 'fragments') {
        expect(result.items).toHaveLength(2)
        expect(result.items[0].type).toBe('text')
        expect((result.items[0] as any).text).toContain('The Quadratic Formula:')
        expect(result.items[1].type).toBe('formula')
      }
    })

    it('should attach script-only inline latex to previous glyph', () => {
      const text = createMockTextElement({
        text: 'E = mc$^2$ is famous'
      })
      const result = convertTextOrFormula(text)

      expect(result.type).toBe('fragments')
      if (result.type === 'fragments') {
        expect(result.items).toHaveLength(3)
        expect((result.items[0] as any).text).toBe('E = m')
        expect(result.items[1].type).toBe('formula')
        expect((result.items[1] as any).options.omml).toContain('<m:sSup>')
        expect((result.items[1] as any).options.omml).toContain('c')
        expect((result.items[1] as any).options.fontSize).toBeLessThan(18)
        expect((result.items[2] as any).text).toContain('is famous')
      }
    })

    it('should map formula position and size from text box', () => {
      const text = createMockTextElement({
        id: 'formula-1',
        x: 96,
        y: 192,
        width: 288,
        height: 96,
        text: '\\(\\sqrt{x}\\)'
      })
      const result = convertTextToFormula(text)

      expect(result?.options.objectName).toBe('formula-1')
      expect(result?.options.x).toBe(1)
      expect(result?.options.y).toBe(2)
      expect(result?.options.w).toBe(3)
      expect(result?.options.h).toBe(1)
      expect(result?.options.omml).toContain('<m:rad>')
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

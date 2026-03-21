// Integration tests using fixture JSON files
import { readFileSync } from 'fs'
import { join } from 'path'
import { convertShape } from '../src/pptx/converters/shape'
import { convertText } from '../src/pptx/converters/text'
import { convertLine } from '../src/pptx/converters/line'
import { convertImage } from '../src/pptx/converters/image'
import { convertVideo } from '../src/pptx/converters/video'
import { convertFill } from '../src/pptx/converters/shape'
import { convertEffect } from '../src/pptx/converters/shape'
import { convertSlideBackground } from '../src/pptx/converters/slide'
import type { SlideDocument, Slide } from '../src/sif/types/document'

describe('Fixture-based Integration Tests', () => {
  function loadFixture(fixtureName: string): any {
    const fixturePath = join(__dirname, 'fixtures', fixtureName)
    const content = readFileSync(fixturePath, 'utf-8')
    return JSON.parse(content)
  }

  describe('Cover Slide Fixture', () => {
    const fixture = loadFixture('cover-slide.json')

    it('should load fixture successfully', () => {
      expect(fixture).toBeDefined()
      expect(fixture.width).toBe(1280)
      expect(fixture.height).toBe(720)
      expect(fixture.slides).toHaveLength(1)
    })

    it('should have slide with background gradient', () => {
      const slide = fixture.slides[0]
      expect(slide.elements.length).toBeGreaterThan(0)
    })

    it('should convert gradient fill correctly', () => {
      const bgElement = fixture.slides[0].elements.find((e: any) => e.id === 'bg-rect')
      expect(bgElement).toBeDefined()

      const fill = convertFill(bgElement.fill)
      expect(fill.type).toBe('linearGradient')
    })

    it('should convert shapes with opacity', () => {
      const circle = fixture.slides[0].elements.find((e: any) => e.id === 'decorative-circle-1')
      expect(circle).toBeDefined()

      const result = convertShape(circle)
      expect(result.shapeName).toBe('ellipse')
      expect(result.options.fill).toBeDefined()
    })

    it('should convert shapes with shadow effect', () => {
      const card = fixture.slides[0].elements.find((e: any) => e.id === 'main-card')
      expect(card).toBeDefined()

      const result = convertShape(card)
      expect(result.options.shadow).toBeDefined()
      expect(result.options.shadow?.type).toBe('outer')
    })

    it('should convert rounded rectangle', () => {
      const card = fixture.slides[0].elements.find((e: any) => e.id === 'main-card')
      expect(card).toBeDefined()
      expect(card.rx).toBe(24)
      expect(card.ry).toBe(24)

      const result = convertShape(card)
      expect(result.shapeName).toBe('roundRect')
      expect(result.options.rectRadius).toBeDefined()
    })

    it('should convert text with gradient fill', () => {
      const title = fixture.slides[0].elements.find((e: any) => e.id === 'title-text')
      expect(title).toBeDefined()

      const result = convertText(title)
      expect(result.text).toBe('2025 Annual Work Report')
      expect(result.options.fontSize).toBe(39) // 52px * 0.75 = 39pt
    })

    it('should convert text with textAlign center', () => {
      const title = fixture.slides[0].elements.find((e: any) => e.id === 'title-text')
      expect(title).toBeDefined()

      const result = convertText(title)
      expect(result.options.align).toBe('center')
    })

    it('should convert lines with stroke', () => {
      const line = fixture.slides[0].elements.find((e: any) => e.id === 'divider-line-1')
      expect(line).toBeDefined()
      expect(line.type).toBe('line')

      const result = convertLine(line)
      expect(result.shapeName).toBe('custGeom')
      expect(result.options.line).toBeDefined()
      expect(result.options.points).toBeDefined()
      expect(result.options.line!.color).toBe('4285F4')
    })
  })

  describe('Pie Chart Fixture', () => {
    const fixture = loadFixture('pie-chart.json')

    it('should load fixture successfully', () => {
      expect(fixture).toBeDefined()
      expect(fixture.slides[0].background).toBeDefined()
    })

    it('should convert slide background', () => {
      const slide = fixture.slides[0]
      const background = convertSlideBackground(slide.background)
      expect(background).toBeDefined()
      expect(background!.color).toBe('FFFFFF')
    })

    it('should convert path shapes for pie sectors', () => {
      const sector = fixture.slides[0].elements.find((e: any) => e.id === 'pie-sector-1')
      expect(sector).toBeDefined()
      expect(sector.shapeType).toBe('path')

      // Path shapes now use CUSTOM_GEOMETRY via the local pptxgenjs custGeom support
      const result = convertShape(sector)
      expect(result.shapeName).toBe('custGeom')
      expect(result.options.points).toBeDefined()
    })

    it('should convert legend items with gradient fills', () => {
      // Note: legend items are inside a group element, not top-level elements
      // This tests the group flattening logic
      const legendGroup = fixture.slides[0].elements.find((e: any) => e.id === 'legend-group')
      expect(legendGroup).toBeDefined()
      expect(legendGroup.type).toBe('group')
      expect(legendGroup.children).toBeDefined()
      expect(legendGroup.children.length).toBeGreaterThan(0)

      // First child of legend group should be the legend title
      const legendTitle = legendGroup.children.find((c: any) => c.id === 'legend-title')
      expect(legendTitle).toBeDefined()
    })

    it('should convert text with bold weight', () => {
      const title = fixture.slides[0].elements.find((e: any) => e.id === 'title')
      expect(title).toBeDefined()
      expect(title.fontWeight).toBe('bold')

      const result = convertText(title)
      expect(result.options.bold).toBe(true)
    })
  })

  describe('Complex Elements Fixture', () => {
    const fixture = loadFixture('complex-elements.json')

    it('should load fixture successfully', () => {
      expect(fixture).toBeDefined()
      expect(fixture.slides[0].elements.length).toBeGreaterThan(20)
    })

    it('should convert shapes with various fill types', () => {
      const solidShape = fixture.slides[0].elements.find((e: any) => e.id === 'header-bar')
      const result = convertShape(solidShape)
      expect(result.options.fill!.type).toBe('solid')
    })

    it('should convert text with decoration (underline)', () => {
      const underlinedText = fixture.slides[0].elements.find((e: any) => e.id === 'underline-text')
      expect(underlinedText).toBeDefined()
      expect(underlinedText.decoration.underline).toBe(true)

      const result = convertText(underlinedText)
      expect(result.options.underline).toBeDefined()
    })

    it('should convert text with decoration (strikethrough)', () => {
      const strikethroughText = fixture.slides[0].elements.find((e: any) => e.id === 'strikethrough-text')
      expect(strikethroughText).toBeDefined()
      expect(strikethroughText.decoration.lineThrough).toBe(true)

      const result = convertText(strikethroughText)
      expect(result.options.strike).toBe(true)
    })

    it('should convert text with letter spacing', () => {
      const spacedText = fixture.slides[0].elements.find((e: any) => e.id === 'spaced-text')
      expect(spacedText).toBeDefined()
      expect(spacedText.letterSpacing).toBe(5)

      const result = convertText(spacedText)
      expect(result.options.charSpacing).toBeDefined()
      expect(result.options.charSpacing).toBeCloseTo(3.75, 1) // 5px * 0.75 = 3.75pt
    })

    it('should convert text with line height', () => {
      const multilineText = fixture.slides[0].elements.find((e: any) => e.id === 'multiline-text')
      expect(multilineText).toBeDefined()
      expect(multilineText.lineHeight).toBe(28)

      const result = convertText(multilineText)
      expect(result.options.lineSpacingMultiple).toBe(1.75) // 28/16
    })

    it('should convert text with different alignments', () => {
      const leftText = fixture.slides[0].elements.find((e: any) => e.id === 'left-aligned')
      const centerText = fixture.slides[0].elements.find((e: any) => e.id === 'center-aligned')
      const rightText = fixture.slides[0].elements.find((e: any) => e.id === 'right-aligned')

      expect(convertText(leftText).options.align).toBe('left')
      expect(convertText(centerText).options.align).toBe('center')
      expect(convertText(rightText).options.align).toBe('right')
    })

    it('should convert lines with dash arrays', () => {
      const dashedLine = fixture.slides[0].elements.find((e: any) => e.id === 'dashed-line')
      expect(dashedLine).toBeDefined()
      expect(dashedLine.stroke.dashArray).toBe('5,5')

      const result = convertLine(dashedLine)
      expect(result.options.line!.dashType).toBe('dash')
    })

    it('should convert lines with arrow markers', () => {
      const arrowLine = fixture.slides[0].elements.find((e: any) => e.id === 'arrow-line')
      expect(arrowLine).toBeDefined()
      expect(arrowLine.markerEnd).toBe('arrow')

      const result = convertLine(arrowLine)
      expect(result.options.line!.endArrowType).toBe('arrow')
    })

    it('should convert lines with different arrow types', () => {
      const diamondLine = fixture.slides[0].elements.find((e: any) => e.id === 'diamond-arrow-line')
      const circleLine = fixture.slides[0].elements.find((e: any) => e.id === 'circle-arrow-line')

      expect(convertLine(diamondLine).options.line!.endArrowType).toBe('diamond')
      expect(convertLine(circleLine).options.line!.endArrowType).toBe('oval') // circle maps to oval
    })

    it('should convert shapes with opacity', () => {
      const transparentShape = fixture.slides[0].elements.find((e: any) => e.id === 'transparent-shape')
      expect(transparentShape).toBeDefined()
      expect(transparentShape.fill.opacity).toBe(0.5)

      const result = convertShape(transparentShape)
      // Combined with fill transparency
      expect(result.options.fill).toBeDefined()
    })

    it('should convert shapes with stroke opacity', () => {
      const semiTransparentCircle = fixture.slides[0].elements.find((e: any) => e.id === 'semi-transparent-circle')
      expect(semiTransparentCircle).toBeDefined()
      expect(semiTransparentCircle.stroke.opacity).toBe(0.7)

      const result = convertShape(semiTransparentCircle)
      expect(result.options.line).toBeDefined()
    })

    it('should convert rotated shapes', () => {
      const rotatedRect = fixture.slides[0].elements.find((e: any) => e.id === 'rotated-rect')
      expect(rotatedRect).toBeDefined()
      expect(rotatedRect.transform.rotate).toBe(15)

      const result = convertShape(rotatedRect)
      expect(result.options.rotate).toBe(15)
    })

    it('should convert rounded rectangles', () => {
      const roundedRect = fixture.slides[0].elements.find((e: any) => e.id === 'rounded-rect')
      expect(roundedRect).toBeDefined()
      expect(roundedRect.rx).toBe(20)

      const result = convertShape(roundedRect)
      expect(result.shapeName).toBe('roundRect')
    })

    it('should convert ellipse shapes', () => {
      const ellipse = fixture.slides[0].elements.find((e: any) => e.id === 'ellipse-shape')
      expect(ellipse).toBeDefined()

      const result = convertShape(ellipse)
      expect(result.shapeName).toBe('ellipse')
    })

    it('should convert images', () => {
      const image = fixture.slides[0].elements.find((e: any) => e.id === 'sample-image')
      expect(image).toBeDefined()
      expect(image.type).toBe('image')
      expect(image.href).toBeDefined()

      const result = convertImage(image)
      expect(result.path).toBe(image.href)
    })

    it('should convert flipped images', () => {
      const flippedImage = fixture.slides[0].elements.find((e: any) => e.id === 'flipped-image')
      expect(flippedImage).toBeDefined()
      expect(flippedImage.flipH).toBe(true)

      const result = convertImage(flippedImage)
      expect(result.flipH).toBe(true)
    })

    it('should convert images with opacity', () => {
      const transparentImage = fixture.slides[0].elements.find((e: any) => e.id === 'transparent-image')
      expect(transparentImage).toBeDefined()
      expect(transparentImage.opacity).toBe(0.6)

      const result = convertImage(transparentImage)
      expect(result.transparency).toBe(40) // (1 - 0.6) * 100 = 40
    })

    it('should convert videos', () => {
      const video = fixture.slides[0].elements.find((e: any) => e.id === 'sample-video')
      expect(video).toBeDefined()
      expect(video.type).toBe('video')

      const result = convertVideo(video)
      expect(result.type).toBe('video')
      expect(result.path).toBe(video.href)
    })

    it('should convert videos with poster URL', () => {
      const video = fixture.slides[0].elements.find((e: any) => e.id === 'sample-video')
      expect(video.poster).toBeDefined()

      const result = convertVideo(video)
      expect(result.type).toBe('video')
      expect(result.cover).toBe(video.poster)
    })

    it('should convert KPI card shapes with shadows', () => {
      const kpiCard = fixture.slides[0].elements.find((e: any) => e.id === 'kpi-card-1')
      expect(kpiCard).toBeDefined()
      expect(kpiCard.effect).toBeDefined()
      expect(kpiCard.effect.type).toBe('shadow')

      const result = convertShape(kpiCard)
      expect(result.options.shadow).toBeDefined()
    })

    it('should convert thick lines with stroke width in pixels', () => {
      const thickLine = fixture.slides[0].elements.find((e: any) => e.id === 'thick-line')
      expect(thickLine).toBeDefined()
      expect(thickLine.stroke.width).toBe(8)

      const result = convertLine(thickLine)
      expect(result.options.line).toBeDefined()
      expect(result.options.line!.width).toBeCloseTo(6, 0) // 8px * 0.75 = 6pt
    })

    it('should convert footer text with fill opacity', () => {
      const footerText = fixture.slides[0].elements.find((e: any) => e.id === 'footer-text')
      expect(footerText).toBeDefined()
      expect(footerText.fill.opacity).toBe(0.8)

      const result = convertText(footerText)
      // Note: The text converter currently handles element-level opacity (text.opacity)
      // Fill opacity (fill.opacity) is extracted for color but doesn't affect text transparency
      // This is a known limitation
      expect(result.options.color).toBe('FFFFFF')
    })
  })
})

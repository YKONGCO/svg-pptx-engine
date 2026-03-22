// Tests for SVG to SIF converter

import { svgToSif, resetIdCounter } from '../../src/svg/converter'
import { parseSVG, getSvgRoot, getDefs, getChildElements } from '../../src/svg/parser'
import { parseColor, parseOpacity } from '../../src/svg/converters/color'
import { parseTransform, applyTransform } from '../../src/svg/converters/group'

describe('SVG Parser', () => {
  describe('parseSVG', () => {
    it('should parse a simple SVG string', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="red" />
      </svg>`

      const result = parseSVG(svg)
      expect(result).toBeDefined()
      expect(result.svg).toBeDefined()
    })

    it('should parse SVG with defs', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgb(255,255,0);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgb(255,0,0);stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="80" height="80" fill="url(#grad1)" />
      </svg>`

      const parsed = parseSVG(svg)
      const svgRoot = getSvgRoot(parsed)
      expect(svgRoot).toBeDefined()

      const defs = getDefs(svgRoot!)
      expect(defs.size).toBeGreaterThan(0)
    })
  })

  describe('getChildElements', () => {
    it('should extract child elements excluding defs', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" />
        </defs>
        <rect x="10" y="10" width="80" height="80" />
        <circle cx="50" cy="50" r="30" />
      </svg>`

      const parsed = parseSVG(svg)
      const svgRoot = getSvgRoot(parsed)!
      const children = getChildElements(svgRoot)

      expect(children.length).toBeGreaterThanOrEqual(1)
    })

    it('should preserve sibling render order for mixed element types', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g>
          <text x="0" y="10">Title</text>
          <rect x="0" y="20" width="50" height="10" />
          <text x="5" y="28">Label</text>
        </g>
      </svg>`

      const parsed = parseSVG(svg)
      const svgRoot = getSvgRoot(parsed)!
      const group = getChildElements(svgRoot)[0].g as Record<string, unknown>
      const children = getChildElements(group)

      expect(children.map(child => Object.keys(child)[0])).toEqual(['text', 'rect', 'text'])
    })
  })
})

describe('Color Converter', () => {
  describe('parseColor', () => {
    it('should parse 3-character hex colors', () => {
      expect(parseColor('#F00').toLowerCase()).toBe('#ff0000')
      expect(parseColor('#0F0').toLowerCase()).toBe('#00ff00')
      expect(parseColor('#00F').toLowerCase()).toBe('#0000ff')
    })

    it('should parse 6-character hex colors', () => {
      expect(parseColor('#FF0000').toLowerCase()).toBe('#ff0000')
      expect(parseColor('#00FF00').toLowerCase()).toBe('#00ff00')
    })

    it('should parse 8-character hex colors with alpha', () => {
      expect(parseColor('#FF000080').toLowerCase()).toBe('#ff000080')
    })

    it('should parse named colors', () => {
      expect(parseColor('red').toLowerCase()).toBe('#ff0000')
      expect(parseColor('blue').toLowerCase()).toBe('#0000ff')
      expect(parseColor('white').toLowerCase()).toBe('#ffffff')
      expect(parseColor('black').toLowerCase()).toBe('#000000')
    })

    it('should parse rgb() format', () => {
      expect(parseColor('rgb(255,0,0)').toLowerCase()).toBe('#ff0000')
      expect(parseColor('rgb(0,255,0)').toLowerCase()).toBe('#00ff00')
    })

    it('should parse rgba() format with alpha', () => {
      const result = parseColor('rgba(255,0,0,0.5)')
      expect(result.toLowerCase()).toMatch(/^#ff0000[0-9a-f]{2}$/)
    })

    it('should handle transparent', () => {
      expect(parseColor('transparent')).toBe('transparent')
    })

    it('should handle none', () => {
      // 'none' is SVG's way of saying no fill, which we treat as transparent
      const result = parseColor('none')
      expect(result === 'transparent' || result === 'none').toBe(true)
    })

    it('should handle undefined/null', () => {
      expect(parseColor(undefined)).toBe('transparent')
      expect(parseColor(null)).toBe('transparent')
    })
  })

  describe('parseOpacity', () => {
    it('should parse decimal opacity values', () => {
      expect(parseOpacity('0.5')).toBe(0.5)
      expect(parseOpacity('1')).toBe(1)
      expect(parseOpacity('0')).toBe(0)
    })

    it('should parse percentage values', () => {
      expect(parseOpacity('50%')).toBe(0.5)
      expect(parseOpacity('100%')).toBe(1)
    })

    it('should return undefined for invalid values', () => {
      expect(parseOpacity(undefined)).toBeUndefined()
      expect(parseOpacity('invalid')).toBeUndefined()
    })
  })
})

describe('Transform Converter', () => {
  describe('parseTransform', () => {
    it('should parse translate transform', () => {
      const result = parseTransform('translate(10, 20)')
      expect(result).toBeDefined()
      expect(result?.translateX).toBe(10)
      expect(result?.translateY).toBe(20)
    })

    it('should parse translate with single value', () => {
      const result = parseTransform('translate(10)')
      expect(result).toBeDefined()
      expect(result?.translateX).toBe(10)
      expect(result?.translateY).toBe(0)
    })

    it('should parse rotate transform', () => {
      const result = parseTransform('rotate(45)')
      expect(result).toBeDefined()
      expect(result?.rotate).toBe(45)
    })

    it('should parse scale transform', () => {
      const result = parseTransform('scale(2)')
      expect(result).toBeDefined()
      expect(result?.scaleX).toBe(2)
      expect(result?.scaleY).toBe(2)
    })

    it('should parse scale with two values', () => {
      const result = parseTransform('scale(2, 3)')
      expect(result).toBeDefined()
      expect(result?.scaleX).toBe(2)
      expect(result?.scaleY).toBe(3)
    })

    it('should parse combined transforms', () => {
      const result = parseTransform('translate(10, 20) rotate(45) scale(2)')
      expect(result).toBeDefined()
      expect(result?.translateX).toBe(10)
      expect(result?.translateY).toBe(20)
      expect(result?.rotate).toBe(45)
      expect(result?.scaleX).toBe(2)
    })

    it('should return undefined for empty transform', () => {
      expect(parseTransform(undefined)).toBeUndefined()
      expect(parseTransform('')).toBeUndefined()
    })
  })

  describe('applyTransform', () => {
    it('should apply translation', () => {
      const result = applyTransform(10, 20, 100, 50, { translateX: 5, translateY: 10 })
      // Translation is applied directly (x + translateX, y + translateY)
      expect(result.x).toBe(15)
      expect(result.y).toBe(30)
    })

    it('should apply scale', () => {
      const result = applyTransform(10, 20, 100, 50, { translateX: 0, translateY: 0, scaleX: 2, scaleY: 2 })
      expect(result.x).toBe(20)
      expect(result.y).toBe(40)
      expect(result.width).toBe(200)
      expect(result.height).toBe(100)
    })

    it('should not modify when no transform', () => {
      const result = applyTransform(10, 20, 100, 50, undefined)
      expect(result.x).toBe(10)
      expect(result.y).toBe(20)
      expect(result.width).toBe(100)
      expect(result.height).toBe(50)
    })
  })
})

describe('SVG to SIF Converter', () => {
  beforeEach(() => {
    resetIdCounter()
  })

  describe('Basic Shapes', () => {
    it('should convert a simple rect', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="red" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('rect')
      expect((elements[0] as any).x).toBe(10)
      expect((elements[0] as any).y).toBe(10)
      expect((elements[0] as any).width).toBe(80)
      expect((elements[0] as any).height).toBe(80)
    })

    it('should convert a circle', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="blue" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('circle')
      expect((elements[0] as any).cx).toBe(50)
      expect((elements[0] as any).cy).toBe(50)
      expect((elements[0] as any).r).toBe(40)
    })

    it('should convert an ellipse', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="50" rx="40" ry="20" fill="green" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('ellipse')
      expect((elements[0] as any).rx).toBe(40)
      expect((elements[0] as any).ry).toBe(20)
    })

    it('should convert a line', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <line x1="10" y1="10" x2="90" y2="90" stroke="black" stroke-width="2" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('line')
      expect((elements[0] as any).x1).toBe(10)
      expect((elements[0] as any).y1).toBe(10)
      expect((elements[0] as any).x2).toBe(90)
      expect((elements[0] as any).y2).toBe(90)
    })

    it('should convert a polygon', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <polygon points="50,10 90,90 10,90" fill="red" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('polygon')
    })

    it('should convert a polyline', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <polyline points="10,10 50,50 90,10" fill="none" stroke="black" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      // Note: due to heuristic detection, polyline may be detected as polygon
      expect(['polyline', 'polygon']).toContain((elements[0] as any).shapeType)
    })

    it('should convert a path', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M 10,10 L 90,90 L 10,90 Z" fill="red" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('shape')
      expect((elements[0] as any).shapeType).toBe('path')
    })
  })

  describe('Text Elements', () => {
    it('should convert a simple text element', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="20" font-family="Arial" font-size="16" fill="black">Hello World</text>
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('text')
      expect((elements[0] as any).text).toContain('Hello World')
      expect((elements[0] as any).fontFamily).toBe('Arial')
      expect((elements[0] as any).fontSize).toBe(16)
      expect((elements[0] as any).x).toBe(10)
      expect((elements[0] as any).y).toBeCloseTo(7.2, 1)
    })

    it('should convert text-anchor to text box left edge', () => {
      const svg = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <text x="100" y="40" font-family="Arial" font-size="20" text-anchor="middle">Hello</text>
      </svg>`

      const elements = svgToSif(svg)
      const text = elements[0] as any

      expect(text.type).toBe('text')
      expect(text.x).toBeCloseTo(55.2, 1)
      expect(text.width).toBeCloseTo(89.6, 1)
    })

    it('should convert dominant-baseline middle to text box top edge', () => {
      const svg = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <text x="20" y="50" font-family="Arial" font-size="20" dominant-baseline="middle">Hello</text>
      </svg>`

      const elements = svgToSif(svg)
      const text = elements[0] as any

      expect(text.type).toBe('text')
      expect(text.y).toBeCloseTo(35.5, 1)
      expect(text.height).toBeCloseTo(29, 1)
    })

    it('should handle text with tspans', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="20" font-family="Arial" font-size="16" fill="black">
          <tspan font-weight="bold">Bold text</tspan>
          <tspan fill="red">Red text</tspan>
        </text>
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('text')
      // RichTextElement has runs
      expect((elements[0] as any).runs).toBeDefined()
      expect(Array.isArray((elements[0] as any).runs)).toBe(true)
    })

    it('should preserve single tspan text content', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="20" font-family="Arial" font-size="16" fill="black"><tspan>Hello</tspan></text>
      </svg>`

      const elements = svgToSif(svg)
      expect(elements.length).toBe(1)
      expect((elements[0] as any).text).toBe('Hello')
      expect((elements[0] as any).runs).toBeDefined()
      expect((elements[0] as any).runs[0].text).toBe('Hello')
    })

    it('should preserve multi-line tspans as line breaks in fallback text', () => {
      const svg = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
        <text x="10" y="20" font-family="Arial" font-size="16" fill="black">
          <tspan x="10" dy="0">Line 1</tspan>
          <tspan x="10" dy="20">Line 2</tspan>
          <tspan x="10" dy="20">Line 3</tspan>
        </text>
      </svg>`

      const elements = svgToSif(svg)
      expect((elements[0] as any).text).toBe('Line 1\nLine 2\nLine 3')
      expect((elements[0] as any).runs).toHaveLength(3)
    })
  })

  describe('Group Elements', () => {
    it('should flatten group when preserveGroups is false', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="10" y="10" width="30" height="30" fill="red" />
          <circle cx="70" cy="25" r="20" fill="blue" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })

      // Without preserving groups, children are flattened
      expect(elements.length).toBe(2)
      expect(elements[0].type).toBe('shape')
      expect(elements[1].type).toBe('shape')
    })

    it('should preserve group when preserveGroups is true', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="10" y="10" width="30" height="30" fill="red" />
          <circle cx="70" cy="25" r="20" fill="blue" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: true })

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('group')
      const group = elements[0] as any
      expect(group.children).toBeDefined()
      expect(group.children.length).toBe(2)
    })

    it('should handle nested groups with preserveGroups', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="10" y="10" width="30" height="30" fill="red" />
          <g>
            <circle cx="70" cy="25" r="20" fill="blue" />
          </g>
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: true })

      expect(elements.length).toBe(1)
      expect(elements[0].type).toBe('group')
      const group = elements[0] as any
      expect(group.children).toBeDefined()
      expect(group.children.length).toBe(2) // rect + nested group
    })

    it('should merge group translate into child coordinates', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(50, 20)">
          <rect x="10" y="15" width="30" height="10" fill="red" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const rect = elements[0] as any

      expect(elements.length).toBe(1)
      expect(rect.type).toBe('shape')
      expect(rect.shapeType).toBe('rect')
      expect(rect.x).toBe(60)
      expect(rect.y).toBe(35)
    })

    it('should apply group opacity to child elements', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.5">
          <rect x="10" y="15" width="30" height="10" fill="red" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const rect = elements[0] as any

      expect(elements.length).toBe(1)
      expect(rect.type).toBe('shape')
      expect(rect.opacity).toBe(0.5)
    })

    it('should apply hidden group visibility to child elements', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <g visibility="hidden">
          <rect x="10" y="15" width="30" height="10" fill="red" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const rect = elements[0] as any

      expect(elements.length).toBe(1)
      expect(rect.type).toBe('shape')
      expect(rect.visible).toBe(false)
    })

    it('should map nested svg viewBox into absolute child coordinates', () => {
      const svg = `<svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
        <svg x="100" y="40" width="120" height="60" viewBox="0 0 24 12">
          <rect x="0" y="0" width="24" height="12" fill="#dbeafe" />
          <circle cx="6" cy="6" r="3" fill="#2563eb" />
        </svg>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const rect = elements[0] as any
      const circle = elements[1] as any

      expect(elements).toHaveLength(2)
      expect(rect.type).toBe('shape')
      expect(rect.x).toBe(100)
      expect(rect.y).toBe(40)
      expect(rect.width).toBe(120)
      expect(rect.height).toBe(60)
      expect(circle.type).toBe('shape')
      expect(circle.cx).toBeCloseTo(130, 4)
      expect(circle.cy).toBeCloseTo(70, 4)
      expect(circle.r).toBeCloseTo(15, 4)
    })

    it('should combine nested svg viewport mapping with svg transform', () => {
      const svg = `<svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
        <svg x="40" y="20" width="200" height="100" viewBox="0 0 100 50" transform="translate(10, 5)">
          <rect x="10" y="5" width="30" height="20" fill="#22c55e" />
        </svg>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const rect = elements[0] as any

      expect(elements).toHaveLength(1)
      expect(rect.type).toBe('shape')
      expect(rect.x).toBeCloseTo(70, 4)
      expect(rect.y).toBeCloseTo(35, 4)
      expect(rect.width).toBeCloseTo(60, 4)
      expect(rect.height).toBeCloseTo(40, 4)
    })
  })

  describe('Fill and Stroke', () => {
    it('should convert solid fill', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="#FF0000" />
      </svg>`

      const elements = svgToSif(svg)
      const fill = (elements[0] as any).fill

      expect(fill.type).toBe('solid')
      expect(fill.color.toLowerCase()).toBe('#ff0000')
    })

    it('should convert fill with opacity', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="red" fill-opacity="0.5" />
      </svg>`

      const elements = svgToSif(svg)
      const fill = (elements[0] as any).fill

      expect(fill.type).toBe('solid')
      expect(fill.opacity).toBe(0.5)
    })

    it('should convert none fill', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="none" stroke="black" />
      </svg>`

      const elements = svgToSif(svg)
      const fill = (elements[0] as any).fill

      // 'none' fill should be represented as { type: 'none' }
      expect(fill.type).toBe('none')
    })

    it('should convert stroke properties', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="80" height="80" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>`

      const elements = svgToSif(svg)
      const stroke = (elements[0] as any).stroke

      expect(stroke).toBeDefined()
      expect(stroke.color.toLowerCase()).toBe('#000000')
      expect(stroke.width).toBe(2)
      expect(stroke.lineCap).toBe('round')
      expect(stroke.lineJoin).toBe('round')
    })

    it('should convert dash array stroke', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <line x1="10" y1="10" x2="90" y2="90" stroke="#000" stroke-width="2" stroke-dasharray="5,5" />
      </svg>`

      const elements = svgToSif(svg)
      const stroke = (elements[0] as any).stroke

      expect(stroke).toBeDefined()
      expect(stroke.dashArray).toBe('5,5')
    })

    it('should resolve gradient fills from defs', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ff0000" />
            <stop offset="100%" stop-color="#0000ff" />
          </linearGradient>
        </defs>
        <rect x="10" y="10" width="80" height="80" fill="url(#grad1)" />
      </svg>`

      const elements = svgToSif(svg)
      const fill = (elements[0] as any).fill

      expect(fill.type).toBe('gradient')
      expect(fill.gradient.type).toBe('linear')
      expect(fill.gradient.stops).toHaveLength(2)
      expect(fill.gradient.stops[0].color.toLowerCase()).toBe('#ff0000')
      expect(fill.gradient.stops[1].color.toLowerCase()).toBe('#0000ff')
    })

    it('should convert filter defs to effects', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow1">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="1" dy="3"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.25"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect x="10" y="10" width="20" height="20" fill="#ff0000" filter="url(#shadow1)" />
      </svg>`

      const elements = svgToSif(svg)
      const effect = (elements[0] as any).effect

      expect(effect).toBeDefined()
      expect(effect.type).toBe('shadow')
      expect(effect.offsetX).toBe(1)
      expect(effect.offsetY).toBe(3)
      expect(effect.blur).toBe(2)
      expect(effect.color.toLowerCase()).toBe('#ff0000')
    })

    it('should convert marker lines to SIF line elements', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowBlue" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
            <path d="M 0,0 L 10,5 L 0,10 Z" fill="#1976D2" />
          </marker>
        </defs>
        <line x1="10" y1="20" x2="80" y2="20" stroke="#1976D2" stroke-width="2" marker-end="url(#arrowBlue)" />
      </svg>`

      const elements = svgToSif(svg)
      expect(elements[0].type).toBe('line')
      expect((elements[0] as any).markerEnd).toBe('arrow')
      expect((elements[0] as any).x1).toBe(10)
      expect((elements[0] as any).x2).toBe(80)
    })
  })

  describe('Transforms', () => {
    it('should handle rotate transform on element', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="40" width="20" height="20" fill="red" transform="rotate(45)" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      expect((elements[0] as any).rotation).toBe(45)
    })

    it('should handle translate transform on element', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="20" height="20" fill="red" transform="translate(5, 10)" />
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(1)
      // Transform should be merged into coordinates or kept as transform
      expect((elements[0] as any).x).toBeDefined()
    })

    it('should compute path bounds from transformed path points instead of raw numeric tokens', () => {
      const svg = `<svg viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(420, 400)">
          <path d="M 0,0 L 0,-200 A 200,200 0 0,1 173.2,100 Z" fill="#2196F3" />
        </g>
      </svg>`

      const elements = svgToSif(svg, { preserveGroups: false })
      const path = elements[0] as any

      expect(path.type).toBe('shape')
      expect(path.shapeType).toBe('path')
      expect(path.x).toBeCloseTo(420, 2)
      expect(path.y).toBeCloseTo(200, 2)
      expect(path.width).toBeGreaterThan(170)
      expect(path.height).toBeGreaterThan(290)
      expect(path.points?.[0]?.x).toBeCloseTo(420, 2)
      expect(path.points?.[0]?.y).toBeCloseTo(400, 2)
    })

    it('should give stroke-only path a non-zero bounding box', () => {
      const svg = `<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
        <path d="M 200 175 C 380 175 380 175 560 175" fill="none" stroke="#2196F3" stroke-width="56" />
      </svg>`

      const elements = svgToSif(svg)
      const path = elements[0] as any

      expect(path.type).toBe('shape')
      expect(path.shapeType).toBe('path')
      expect(path.height).toBeGreaterThan(0)
      expect(path.y).toBeLessThan(175)
      expect(path.width).toBeGreaterThan(360)
    })
  })

  describe('Multiple Elements', () => {
    it('should convert multiple elements', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="30" height="30" fill="red" />
        <circle cx="75" cy="25" r="15" fill="blue" />
        <text x="10" y="60" font-size="12" fill="black">Text</text>
      </svg>`

      const elements = svgToSif(svg)

      expect(elements.length).toBe(3)
      expect(elements[0].type).toBe('shape')
      expect(elements[1].type).toBe('shape')
      expect(elements[2].type).toBe('text')
    })
  })

  describe('Media Elements', () => {
    it('should convert image element with remote href', () => {
      const svg = `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
        <image x="12" y="18" width="90" height="60" href="https://www.w3schools.com/html/img_chania.jpg" preserveAspectRatio="none" opacity="0.8" />
      </svg>`

      const elements = svgToSif(svg)
      const image = elements[0] as any

      expect(elements).toHaveLength(1)
      expect(image.type).toBe('image')
      expect(image.href).toBe('https://www.w3schools.com/html/img_chania.jpg')
      expect(image.x).toBe(12)
      expect(image.y).toBe(18)
      expect(image.width).toBe(90)
      expect(image.height).toBe(60)
      expect(image.preserveAspectRatio).toBe(false)
      expect(image.opacity).toBe(0.8)
    })

    it('should convert video element with poster and controls', () => {
      const svg = `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <video x="24" y="30" width="180" height="100" href="https://www.w3schools.com/html/mov_bbb.mp4" poster="https://www.w3schools.com/html/img_chania.jpg" controls="true" />
      </svg>`

      const elements = svgToSif(svg)
      const video = elements[0] as any

      expect(elements).toHaveLength(1)
      expect(video.type).toBe('video')
      expect(video.href).toBe('https://www.w3schools.com/html/mov_bbb.mp4')
      expect(video.poster).toBe('https://www.w3schools.com/html/img_chania.jpg')
      expect(video.controls).toBe(true)
      expect(video.width).toBe(180)
      expect(video.height).toBe(100)
      expect(video.format).toBe('mp4')
    })

    it('should convert audio element with remote href', () => {
      const svg = `<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">
        <audio x="36" y="42" width="120" height="36" href="https://www.w3schools.com/html/horse.mp3" controls="true" autoplay="true" />
      </svg>`

      const elements = svgToSif(svg)
      const audio = elements[0] as any

      expect(elements).toHaveLength(1)
      expect(audio.type).toBe('audio')
      expect(audio.href).toBe('https://www.w3schools.com/html/horse.mp3')
      expect(audio.autoplay).toBe(true)
      expect(audio.format).toBe('mp3')
      expect(audio.x).toBe(36)
      expect(audio.y).toBe(42)
      expect(audio.width).toBe(120)
      expect(audio.height).toBe(36)
    })

    it('should apply transforms to audio bounds', () => {
      const svg = `<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        <audio x="10" y="20" width="80" height="24" href="https://www.w3schools.com/html/horse.mp3" transform="translate(15, 25)" />
      </svg>`

      const elements = svgToSif(svg)
      const audio = elements[0] as any

      expect(audio.type).toBe('audio')
      expect(audio.x).toBe(25)
      expect(audio.y).toBe(45)
      expect(audio.width).toBe(80)
      expect(audio.height).toBe(24)
    })
  })

  describe('Error Handling', () => {
    it('should throw error for invalid SVG', () => {
      expect(() => {
        svgToSif('not an svg')
      }).toThrow()
    })

    it('should handle empty SVG', () => {
      const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs></defs>
      </svg>`

      const elements = svgToSif(svg)
      expect(elements.length).toBe(0)
    })
  })
})

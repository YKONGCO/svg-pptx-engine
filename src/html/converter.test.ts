// Tests for src/html/converter.ts
//
// M1 acceptance: a simple HTML document with one text block converts
// to a SIF SlideDocument with one RichTextElement on slide 1.
//
// These tests don't actually generate PPTX (that would require
// pptxgenjs to run) — they assert on the SIF document shape.

import { htmlToSif, htmlToSlideDocument } from './converter'

/**
 * The body is always wrapped in a single `body-block` layout group
 * sized to the slide, so the layout pass can position its children.
 * These tests descend into the wrapper to assert on the inner
 * element shape.
 */
function unwrap(elements: any[]): any[] {
  if (elements.length === 0) return elements
  const first = elements[0]
  if (first?.type === 'group' && first.id === 'body-block') {
    return first.children || []
  }
  return elements
}

describe('htmlToSif', () => {
  it('emits a single RichTextElement for a simple <h1>', () => {
    const html = `<body><h1>title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    expect(elements).toHaveLength(1)
    const el = elements[0]
    expect(el.type).toBe('text')
    if (el.type === 'text') {
      expect(el.text).toBe('title')
    }
  })

  it('emits no element for an empty body', () => {
    const html = `<body></body>`
    const elements = htmlToSif(html)
    // Empty body → no children inside the body-block wrapper.
    const inner = unwrap(elements)
    expect(inner).toEqual([])
  })

  it('applies color from inline style', () => {
    const html = `<body><h1 style="color: red">title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      // named color 'red' normalises to 6-digit hex
      expect(el.fill).toEqual({ type: 'solid', color: '#FF0000' })
    }
  })

  it('applies font-size from inline style', () => {
    const html = `<body><h1 style="font-size: 48px">title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      expect(el.fontSize).toBe(48)
    }
  })

  it('applies font-weight from inline style', () => {
    const html = `<body><h1 style="font-weight: bold">title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      expect(el.fontWeight).toBe('bold')
    }
  })

  it('applies text-align from inline style', () => {
    const html = `<body><h1 style="text-align: center">title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      expect(el.textAlign).toBe('center')
    }
  })

  it('reads font-family from <style> block', () => {
    const html = `<html>
      <head><style>h1 { font-family: Arial, sans-serif; }</style></head>
      <body><h1>title</h1></body>
    </html>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      expect(el.fontFamily).toContain('Arial')
    }
  })

  it('falls back to the h1 default font-size (32px) when not specified', () => {
    const html = `<body><h1>title</h1></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      expect(el.fontSize).toBe(32)
    }
  })

  it('handles <p> with inherited color from body', () => {
    const html = `<body style="color: #333"><p>text</p></body>`
    const elements = unwrap(htmlToSif(html))
    const el = elements[0]
    if (el.type === 'text') {
      // normalizeColor expands 3-digit hex to 6-digit uppercase.
      expect(el.fill).toEqual({ type: 'solid', color: '#333333' })
    }
  })
})

describe('htmlToSlideDocument', () => {
  it('returns a SlideDocument with version, dimensions, and one slide', () => {
    const html = `<body style="width: 1280px; height: 720px">
      <h1>title</h1>
    </body>`
    const doc = htmlToSlideDocument(html)
    expect(doc.version).toBeDefined()
    expect(doc.width).toBe(1280)
    expect(doc.height).toBe(720)
    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0].elements).toHaveLength(1)
  })

  it('defaults to 960x540 when no body width/height', () => {
    const html = `<body><h1>x</h1></body>`
    const doc = htmlToSlideDocument(html)
    expect(doc.width).toBe(960)
    expect(doc.height).toBe(540)
  })

  it('uses body background as the slide background', () => {
    const html = `<body style="width: 1280px; height: 720px; background: #FFFFFF">
      <h1>x</h1>
    </body>`
    const doc = htmlToSlideDocument(html)
    expect(doc.slides[0].background).toBeDefined()
    expect(doc.slides[0].background?.fill).toEqual({ type: 'solid', color: '#FFFFFF' })
  })

  it('positions elements sequentially when no explicit layout is given (default block)', () => {
    const html = `<body style="width: 1280px; height: 720px">
      <h1>title</h1>
      <p>body</p>
    </body>`
    const doc = htmlToSlideDocument(html)
    // Top-level body is wrapped in a single body-block group; the
    // layout pass has flattened the tree, so the slide's element list
    // is now a flat list of leaves positioned in absolute coords.
    const els = doc.slides[0].elements
    expect(els.length).toBeGreaterThanOrEqual(2)
    const first = els[0] as any
    const second = els[1] as any
    expect(first.type).toBe('text')
    expect(second.type).toBe('text')
    // After layout, the second paragraph should be below the first.
    expect(second.y).toBeGreaterThanOrEqual(first.y)
  })
})

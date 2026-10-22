// Integration tests for src/html/converter.ts (M2-M9)
//
// These tests cover the full HTML → SIF pipeline for the supported
// block-level features. The SIF document shape is asserted on
// directly — PPTX generation is exercised by separate e2e tests.

import { htmlToSif, htmlToSlideDocument } from '../converter'
import { htmlToStyleMap } from '../css/pipeline'

function childrenOf(el: any): any[] {
  return el.children || []
}

/**
 * Run the converter with `useLayout: 'off'` to inspect the
 * pre-layout tree. Most structural assertions (does this container
 * declare `layout: 'flex'`? does the ul have 4 li children?) are
 * easier to verify before the layout pass flattens the tree.
 *
 * Returns the body-block wrapper's children so tests can assert on
 * the user-authored container / element directly.
 */
function rawSif(html: string): any[] {
  const tree = htmlToSif(html, { useLayout: 'off' })
  if (tree[0]?.type === 'group' && tree[0].id === 'body-block') {
    return tree[0].children || []
  }
  return tree
}

describe('M2 block containers', () => {
  it('wraps a div with display:flex in a GroupElement with layout=flex', () => {
    const html = `<body style="width: 800px; height: 600px">
      <div style="display: flex">
        <p>a</p>
        <p>b</p>
      </div>
    </body>`
    const elements = rawSif(html)
    expect(elements).toHaveLength(1)
    const group = elements[0]
    expect(group.type).toBe('group')
    if (group.type === 'group') {
      expect(group.layout).toBe('flex')
      expect(group.children).toHaveLength(2)
    }
  })

  it('reads flex-direction, justify-content, align-items', () => {
    const html = `<body><div style="display: flex; flex-direction: column; justify-content: center; align-items: stretch">
      <p>a</p>
    </div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    expect(group.flexDirection).toBe('column')
    expect(group.justifyContent).toBe('center')
    expect(group.alignItems).toBe('stretch')
  })

  it('reads gap, padding', () => {
    const html = `<body><div style="display: flex; gap: 16px; padding: 8px 12px"><p>a</p></div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    expect(group.gap).toBe(16)
    expect(group.padding).toBeDefined()
    expect(group.padding.top).toBe(8)
    expect(group.padding.right).toBe(12)
  })

  it('reads background fill on a container', () => {
    const html = `<body><div style="display: block; background: #abcdef; padding: 8px"><p>x</p></div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    const backing = group.children.find((c: any) => c.type === 'shape' && c.shapeType === 'rect')
    expect(backing).toBeDefined()
    expect(backing.fill.color).toBe('#ABCDEF')
  })

  it('drops elements with display: none', () => {
    const html = `<body>
      <p>visible</p>
      <p style="display: none">hidden</p>
    </body>`
    const elements = rawSif(html)
    // After conversion the body-block wrapper has been unwrapped by
    // `rawSif`; the remaining direct children should be the single
    // visible <p> (the hidden one was filtered out by the converter).
    expect(elements).toHaveLength(1)
    expect(elements[0].text).toBe('visible')
  })

  it('reads border + border-radius into a backing rect', () => {
    const html = `<body><div style="display: block; border: 2px solid #000; border-radius: 8px"><p>x</p></div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    const backing = group.children.find((c: any) => c.type === 'shape' && c.shapeType === 'rect')
    expect(backing.stroke.width).toBe(2)
    expect(backing.stroke.color).toBe('#000000')
    expect(backing.rx).toBe(8)
    expect(backing.ry).toBe(8)
  })

  it('reads box-shadow into a group effect', () => {
    const html = `<body><div style="display: block; box-shadow: 0 4px 8px rgba(0,0,0,0.2)"><p>x</p></div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    expect(group.effect?.type).toBe('shadow')
  })

  it('reads grid display with template columns', () => {
    const html = `<body><div style="display: grid; grid-template-columns: 1fr 1fr"><p>a</p><p>b</p></div></body>`
    const elements = rawSif(html)
    const group = elements[0] as any
    expect(group.layout).toBe('grid')
    expect(group.gridTemplateColumns).toEqual(['1fr', '1fr'])
  })
})

describe('M6 media', () => {
  it('converts <img> to ImageElement', () => {
    const html = `<body><img src="cat.png" alt="cat" style="width: 200px; height: 150px"></body>`
    const elements = rawSif(html)
    const img = elements[0]
    expect(img.type).toBe('image')
    expect(img.href).toBe('cat.png')
    expect(img.format).toBe('png')
    expect(img.width).toBe(200)
    expect(img.height).toBe(150)
  })

  it('infers image format from extension', () => {
    const html = `<body><img src="logo.svg"></body>`
    const elements = rawSif(html)
    expect(elements[0].format).toBe('svg')
  })

  it('converts <hr> to a 1px rect', () => {
    const html = `<body><hr style="color: #999"></body>`
    const elements = rawSif(html)
    const hr = elements[0]
    expect(hr.type).toBe('shape')
    expect(hr.shapeType).toBe('rect')
    expect(hr.height).toBe(1)
    expect(hr.stroke.color).toBe('#999999')
  })
})

describe('M7 lists', () => {
  it('converts <ul> to a group of bullet items', () => {
    const html = `<body><ul><li>one</li><li>two</li></ul></body>`
    const elements = rawSif(html)
    const list = elements[0]
    expect(list.type).toBe('group')
    expect(list.children).toHaveLength(2)
    const firstItem = list.children[0]
    expect(firstItem.type).toBe('group')
    expect(firstItem.children[0].type).toBe('text')
    expect(firstItem.children[0].text).toContain('•')
  })

  it('converts <ol> to numbered items', () => {
    const html = `<body><ol><li>first</li><li>second</li></ol></body>`
    const elements = rawSif(html)
    const list = elements[0]
    expect(list.children[0].children[0].text).toContain('1.')
    expect(list.children[1].children[0].text).toContain('2.')
  })

  it('renders <blockquote> as a quoted block group', () => {
    const html = `<body><blockquote>hello</blockquote></body>`
    const elements = rawSif(html)
    const bq = elements[0]
    expect(bq.type).toBe('group')
    expect(bq.meta?.role).toBe('blockquote')
    expect(bq.padding?.left).toBe(16)
  })
})

describe('M5 inline rich text in headings', () => {
  it('emits RichTextElement for h1 with inline markup', () => {
    const html = `<body><h1>hello <b>world</b></h1></body>`
    const elements = rawSif(html)
    const el = elements[0]
    expect(el.type).toBe('text')
    expect(el.runs).toBeDefined()
    expect(el.runs.length).toBeGreaterThan(1)
    const boldRun = el.runs.find((r: any) => r.text === 'world')
    expect(boldRun.fontWeight).toBe('bold')
  })

  it('emits plain TextElement for h1 with no inline markup', () => {
    const html = `<body><h1>hello</h1></body>`
    const elements = rawSif(html)
    const el = elements[0]
    expect(el.type).toBe('text')
    expect(el.runs).toBeUndefined()
    expect(el.text).toBe('hello')
  })
})

describe('htmlToSlideDocument integration', () => {
  it('produces a complete document from a real template', () => {
    const html = `<body style="width: 1280px; height: 720px; background: #F5F5F5">
      <div style="display: flex; flex-direction: column; gap: 24px; padding: 48px">
        <h1 style="color: #1A1A1A; font-size: 48px">Title</h1>
        <p style="color: #666666; font-size: 18px">A <b>rich</b> paragraph.</p>
        <ul>
          <li>one</li>
          <li>two</li>
        </ul>
      </div>
    </body>`
    const doc = htmlToSlideDocument(html)
    expect(doc.width).toBe(1280)
    expect(doc.height).toBe(720)
    expect(doc.slides).toHaveLength(1)
    const slide = doc.slides[0]
    expect(slide.background?.fill).toEqual({ type: 'solid', color: '#F5F5F5' })
  })

  it('handles a card with shadow + border-radius', () => {
    const html = `<body style="width: 1280px; height: 720px">
      <div style="display: block; background: white; border: 1px solid #eee; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
        <h2>Card</h2>
        <p>content</p>
      </div>
    </body>`
    const doc = htmlToSlideDocument(html)
    expect(doc.slides).toHaveLength(1)
  })
})

describe('warn-once for unsupported tags', () => {
  it('falls back to text for unknown tags', () => {
    const html = `<body><custom-tag>hello</custom-tag></body>`
    const elements = htmlToSif(html)
    // Unknown tags should not throw; content surfaces as a text element.
    expect(elements.length).toBeGreaterThan(0)
  })
})

describe('computeStyles integration', () => {
  it('inline + style block rules both apply', () => {
    const html = `<html>
      <head><style>p { color: blue }</style></head>
      <body>
        <p style="font-size: 24px">text</p>
      </body>
    </html>`
    const styles = htmlToStyleMap(html)
    expect(styles.size).toBeGreaterThan(0)
    const elements = rawSif(html)
    const el = elements[0]
    expect(el.fontSize).toBe(24)
    expect(el.fill.color).toBe('#0000FF')
  })
})

describe('layout pass positions children', () => {
  it('block siblings stack vertically after layout', () => {
    const html = `<body style="width: 800px; height: 600px">
      <h1>title</h1>
      <p>body</p>
    </body>`
    const doc = htmlToSlideDocument(html)
    const els = doc.slides[0].elements as any[]
    // After layout: at least the two text leaves are positioned
    // at absolute slide coords; the body-block wrapper is gone.
    const texts = els.filter((e: any) => e.type === 'text')
    expect(texts.length).toBeGreaterThanOrEqual(2)
    expect(texts[1].y).toBeGreaterThan(texts[0].y)
  })

  it('flex row children sit side-by-side after layout', () => {
    const html = `<body style="width: 800px; height: 600px">
      <div style="display: flex; gap: 16px">
        <p>left</p>
        <p>right</p>
      </div>
    </body>`
    const doc = htmlToSlideDocument(html)
    const els = doc.slides[0].elements as any[]
    const texts = els.filter((e: any) => e.type === 'text')
    expect(texts.length).toBeGreaterThanOrEqual(2)
    expect(texts[1].x).toBeGreaterThan(texts[0].x)
  })
})
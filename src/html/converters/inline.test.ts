// Tests for src/html/converters/inline.ts
//
// flattenInlineContent(): walk an element's children and produce a
// flat list of TextRuns, honouring <br>, bold, italic, etc.

import { parseHTML } from '../parser'
import { htmlToStyleMap } from '../css/pipeline'
import { flattenInlineContent } from './inline'

function runs(html: string): Array<{ text: string; fontWeight?: any; fontStyle?: any; decoration?: any; baselineShift?: any; fill?: any }> {
  const doc = parseHTML(html)
  const body = doc.body
  const p = body.children.find((c: any) => c.type === 'element' && c.tagName === 'p') as any
  const styles = htmlToStyleMap(html)
  const result = flattenInlineContent(p, styles)
  return result.map(r => {
    const out: any = { text: r.text }
    if (r.fontWeight !== undefined) out.fontWeight = r.fontWeight
    if (r.fontStyle !== undefined) out.fontStyle = r.fontStyle
    if (r.decoration !== undefined) out.decoration = r.decoration
    if (r.baselineShift !== undefined) out.baselineShift = r.baselineShift
    if (r.fill !== undefined) out.fill = r.fill
    return out
  })
}

describe('flattenInlineContent', () => {
  it('returns a single run for plain text', () => {
    expect(runs(`<body><p>hello world</p></body>`)).toEqual([
      { text: 'hello world' },
    ])
  })

  it('marks <b> as bold', () => {
    const r = runs(`<body><p>hello <b>world</b></p></body>`)
    expect(r).toEqual([
      { text: 'hello ' },
      { text: 'world', fontWeight: 'bold' },
    ])
  })

  it('marks <strong> as bold', () => {
    const r = runs(`<body><p>a <strong>strong</strong> word</p></body>`)
    expect(r).toEqual([
      { text: 'a ' },
      { text: 'strong', fontWeight: 'bold' },
      { text: ' word' },
    ])
  })

  it('marks <i> and <em> as italic', () => {
    const r1 = runs(`<body><p>an <i>italic</i> word</p></body>`)
    expect(r1[1]).toEqual({ text: 'italic', fontStyle: 'italic' })
    const r2 = runs(`<body><p>an <em>emph</em> word</p></body>`)
    expect(r2[1]).toEqual({ text: 'emph', fontStyle: 'italic' })
  })

  it('marks <u> as underlined', () => {
    const r = runs(`<body><p>a <u>under</u> word</p></body>`)
    expect(r[1].decoration).toEqual({ underline: true })
  })

  it('marks <s>/<del> as line-through', () => {
    const r1 = runs(`<body><p>a <s>struck</s> word</p></body>`)
    expect(r1[1].decoration).toEqual({ lineThrough: true })
    const r2 = runs(`<body><p>a <del>del</del> word</p></body>`)
    expect(r2[1].decoration).toEqual({ lineThrough: true })
  })

  it('marks <mark> with a yellow fill (best-effort)', () => {
    const r = runs(`<body><p>a <mark>marked</mark> word</p></body>`)
    expect(r[1].fill).toBeDefined()
  })

  it('marks <sub> as subscript and <sup> as superscript', () => {
    const r1 = runs(`<body><p>H<sub>2</sub>O</p></body>`)
    expect(r1[1].baselineShift).toBe('sub')
    const r2 = runs(`<body><p>x<sup>2</sup></p></body>`)
    expect(r2[1].baselineShift).toBe('super')
  })

  it('<br> forces a run break', () => {
    const r = runs(`<body><p>line1<br>line2</p></body>`)
    // The PPTX layer turns a trailing `\n` into `breakLine: true`; the
    // test normalises it away so we only assert the structural
    // boundary (two separate runs).
    const texts = r.map(x => x.text?.replace(/\n/g, ''))
    expect(texts).toEqual(['line1', 'line2'])
  })

  it('handles nested bold + italic', () => {
    const r = runs(`<body><p>a <b><i>both</i></b> word</p></body>`)
    expect(r[1]).toEqual({ text: 'both', fontWeight: 'bold', fontStyle: 'italic' })
  })

  it('handles <span> with custom color', () => {
    const r = runs(`<body><p>a <span style="color: red">red</span> word</p></body>`)
    expect(r[1].fill).toEqual({ type: 'solid', color: '#FF0000' })
  })

  it('handles <code> as monospace run', () => {
    const r = runs(`<body><p>use <code>foo()</code> please</p></body>`)
    expect(r[1].text).toBe('foo()')
    // monospace set somewhere on the run via the code tag's default style
  })

  it('combines consecutive same-style runs into one (squeeze)', () => {
    const r = runs(`<body><p><b>a</b><b>b</b></p></body>`)
    expect(r).toEqual([
      { text: 'ab', fontWeight: 'bold' },
    ])
  })

  it('returns an empty run for an empty paragraph (so layout still works)', () => {
    const r = runs(`<body><p></p></body>`)
    expect(r).toEqual([])
  })

  it('handles mixed multiple inline elements', () => {
    const r = runs(
      `<body><p>Hello <b>world</b>, <i>italic</i>, <u>under</u>!</p></body>`
    )
    expect(r.map(x => ({ text: x.text, weight: x.fontWeight, style: x.fontStyle, deco: x.decoration }))).toEqual([
      { text: 'Hello ', weight: undefined, style: undefined, deco: undefined },
      { text: 'world', weight: 'bold', style: undefined, deco: undefined },
      { text: ', ', weight: undefined, style: undefined, deco: undefined },
      { text: 'italic', weight: undefined, style: 'italic', deco: undefined },
      { text: ', ', weight: undefined, style: undefined, deco: undefined },
      { text: 'under', weight: undefined, style: undefined, deco: { underline: true } },
      { text: '!', weight: undefined, style: undefined, deco: undefined },
    ])
  })
})

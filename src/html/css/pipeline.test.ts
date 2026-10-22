// Tests for src/html/css/pipeline.ts
//
// End-to-end M0 acceptance: given an HTML string, return a map from
// each element's nodeId to its computed style.
//
// This wires together: parseHTML → parseCSS (style blocks) →
// computeStyles. It's the public entry point that the SIF converters
// will use in M1+.

import { htmlToStyleMap } from './pipeline'
import { parseHTML } from '../parser'
import { findByTag } from '../parser'

function styleOf(map: ReturnType<typeof htmlToStyleMap>, el: { nodeId: string }): Map<string, string> {
  return map.get(el.nodeId) ?? new Map()
}

describe('htmlToStyleMap', () => {
  it('returns a style for every element in the document', () => {
    const html = `<body><div><p>x</p></div></body>`
    const map = htmlToStyleMap(html)
    expect(map.size).toBeGreaterThanOrEqual(3) // body, div, p (head may also exist)
  })

  it('applies <style> block rules', () => {
    const html = `<html>
      <head><style>p { color: red; font-size: 20px; }</style></head>
      <body><p>x</p></body>
    </html>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const p = findByTag(doc.body, 'p')[0]
    const s = styleOf(map, p)
    expect(s.get('color')).toBe('red')
    expect(s.get('font-size')).toBe('20px')
  })

  it('applies inline styles over <style> block rules', () => {
    const html = `<html>
      <head><style>p { color: red; }</style></head>
      <body><p style="color: purple">x</p></body>
    </html>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const p = findByTag(doc.body, 'p')[0]
    expect(styleOf(map, p).get('color')).toBe('purple')
  })

  it('applies tag default styles (h1 = 32px font)', () => {
    const html = `<body><h1>title</h1></body>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const h1 = findByTag(doc.body, 'h1')[0]
    expect(styleOf(map, h1).get('font-size')).toBe('32px')
  })

  it('inherits color from body', () => {
    const html = `<body style="color: #333"><p>text</p></body>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const p = findByTag(doc.body, 'p')[0]
    expect(styleOf(map, p).get('color')).toBe('#333')
  })

  it('handles multiple <style> blocks', () => {
    const html = `<html>
      <head>
        <style>.a { color: red; }</style>
        <style>.b { font-size: 18px; }</style>
      </head>
      <body><p class="a b">x</p></body>
    </html>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const p = findByTag(doc.body, 'p')[0]
    const s = styleOf(map, p)
    expect(s.get('color')).toBe('red')
    expect(s.get('font-size')).toBe('18px')
  })

  it('does not crash on a fragment (no <html> root)', () => {
    const html = `<p style="color: red">x</p>`
    const map = htmlToStyleMap(html)
    expect(map.size).toBeGreaterThan(0)
  })

  it('ignores @media and other unsupported at-rules without crashing', () => {
    const html = `<html>
      <head>
        <style>
          @import url('foo.css');
          @media (max-width: 768px) { .x { color: blue; } }
          p { color: red; }
        </style>
      </head>
      <body><p>x</p></body>
    </html>`
    const map = htmlToStyleMap(html)
    const doc = parseHTML(html)
    const p = findByTag(doc.body, 'p')[0]
    expect(styleOf(map, p).get('color')).toBe('red')
  })
})

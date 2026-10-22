// Tests for src/html/css/parser.ts
//
// css-tree-based CSS rule parser. Goal: turn raw CSS strings (from
// <style> blocks or inline style="...") into a flat list of
// (selector, declarations[]) pairs that the cascade layer can
// process.

import { parseCSS, parseInlineStyle } from './parser'

describe('parseCSS', () => {
  it('parses a single type selector rule', () => {
    const rules = parseCSS(`p { color: red; font-size: 16px; }`)
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe('p')
    expect(rules[0].declarations.get('color')).toBe('red')
    expect(rules[0].declarations.get('font-size')).toBe('16px')
  })

  it('parses class and id selectors separately', () => {
    const rules = parseCSS(`
      .card { padding: 24px; }
      #main { width: 1280px; }
    `)
    expect(rules).toHaveLength(2)
    expect(rules[0].selector).toBe('.card')
    expect(rules[0].declarations.get('padding')).toBe('24px')
    expect(rules[1].selector).toBe('#main')
    expect(rules[1].declarations.get('width')).toBe('1280px')
  })

  it('preserves declaration value with multiple tokens (e.g. padding shorthand)', () => {
    const rules = parseCSS(`.box { margin: 10px 20px 30px 40px; }`)
    expect(rules[0].declarations.get('margin')).toBe('10px 20px 30px 40px')
  })

  it('preserves declaration with function value (gradient)', () => {
    const rules = parseCSS(`
      .bg {
        background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
      }
    `)
    const value = rules[0].declarations.get('background')
    expect(value).toContain('linear-gradient')
    expect(value).toContain('#4F46E5')
  })

  it('skips @media and @import rules', () => {
    const rules = parseCSS(`
      @import url('foo.css');
      @media (max-width: 768px) { .x { color: blue; } }
      .y { color: red; }
    `)
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe('.y')
  })

  it('skips rules with pseudo-class selectors', () => {
    const rules = parseCSS(`
      a:hover { color: red; }
      p { color: black; }
    `)
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe('p')
  })

  it('skips @keyframes', () => {
    const rules = parseCSS(`
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .x { color: red; }
    `)
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe('.x')
  })

  it('skips rules with selector lists (a, b, c) — v1 limitation', () => {
    // css-tree gives us one rule per selector list item; we keep all
    // of them and the cascade merges. Just verify we don't crash.
    const rules = parseCSS(`h1, h2, h3 { color: red; }`)
    expect(rules.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty array for an empty string', () => {
    expect(parseCSS('')).toEqual([])
    expect(parseCSS('   ')).toEqual([])
  })

  it('returns empty array for rules with no declarations', () => {
    const rules = parseCSS(`.x { }`)
    expect(rules).toEqual([])
  })

  it('parses multiple rules in one block, separated by newlines or semicolons', () => {
    const rules = parseCSS(`
      .a { color: red; }
      .b { color: blue; }
      .c { color: green }
    `)
    expect(rules).toHaveLength(3)
    expect(rules.map(r => r.selector)).toEqual(['.a', '.b', '.c'])
  })

  it('handles CSS comments by ignoring them', () => {
    const rules = parseCSS(`
      /* this is a comment */
      .a { color: red; /* inline comment */ }
    `)
    expect(rules).toHaveLength(1)
    expect(rules[0].declarations.get('color')).toBe('red')
  })
})

describe('parseInlineStyle', () => {
  it('returns a single rule with selector ":inline"', () => {
    const rules = parseInlineStyle('color: red; font-size: 16px;')
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe(':inline')
    expect(rules[0].declarations.get('color')).toBe('red')
    expect(rules[0].declarations.get('font-size')).toBe('16px')
  })

  it('handles an empty inline style', () => {
    expect(parseInlineStyle('')).toEqual([])
  })

  it('preserves declaration with gradient', () => {
    const rules = parseInlineStyle(
      'background: linear-gradient(to right, #fff, #000);'
    )
    expect(rules[0].declarations.get('background')).toContain('linear-gradient')
  })
})

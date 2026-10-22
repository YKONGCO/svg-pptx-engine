// Tests for src/html/css/cascade.ts
//
// CSS cascade computation: given a parsed HTML tree and a list of
// <style> block rules, produce a Map<NodeId, ComputedStyle> where
// each value is a Map<cssProperty, value-string>.
//
// Cascade rules (v1):
//   1. Tag default styles (HTML browser defaults for h1-h6, p, body)
//   2. Type / class / id selectors from <style> blocks, sorted by
//      specificity (low → high)
//   3. Inline `style="..."` attribute (highest specificity)
//   4. Inherited properties (color, font-family, font-size, etc.)
//      flow from parent when not set on the element itself.

import { parseHTML } from '../parser'
import { parseCSS } from './parser'
import { computeStyles, type ComputedStyle } from './cascade'

function getStyleFor(
  styles: Map<string, ComputedStyle>,
  doc: ReturnType<typeof parseHTML>,
  selector: (e: any) => boolean
): ComputedStyle | undefined {
  let found: ComputedStyle | undefined
  walk(doc.body, el => {
    if (!found && selector(el)) found = styles.get(el.nodeId)
  })
  return found
}

function walk(root: any, visit: (e: any) => void): void {
  for (const c of root.children) {
    if (c.type === 'element') {
      visit(c)
      walk(c, visit)
    }
  }
}

describe('computeStyles', () => {
  it('returns an empty style map for an element with no matching rules', () => {
    const doc = parseHTML('<body><div>hi</div></body>')
    const styles = computeStyles(doc, [])
    const div = getStyleFor(styles, doc, e => e.tagName === 'div')
    expect(div).toBeDefined()
    // No rules applied — but the element still exists in the map.
  })

  it('applies tag default styles (h1 has 32px font-size by default)', () => {
    const doc = parseHTML('<body><h1>title</h1></body>')
    const styles = computeStyles(doc, [])
    const h1 = getStyleFor(styles, doc, e => e.tagName === 'h1')
    expect(h1?.get('font-size')).toBe('32px')
  })

  it('applies a type selector from a <style> block', () => {
    const doc = parseHTML('<body><h1>title</h1></body>')
    const rules = parseCSS(`h1 { color: red; }`)
    const styles = computeStyles(doc, rules)
    const h1 = getStyleFor(styles, doc, e => e.tagName === 'h1')
    expect(h1?.get('color')).toBe('red')
  })

  it('applies a class selector', () => {
    const doc = parseHTML('<body><p class="card">x</p></body>')
    const rules = parseCSS(`.card { font-size: 20px; color: blue; }`)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('font-size')).toBe('20px')
    expect(p?.get('color')).toBe('blue')
  })

  it('applies an id selector', () => {
    const doc = parseHTML('<body><div id="main">x</div></body>')
    const rules = parseCSS(`#main { width: 1280px; }`)
    const styles = computeStyles(doc, rules)
    const div = getStyleFor(styles, doc, e => e.tagName === 'div')
    expect(div?.get('width')).toBe('1280px')
  })

  it('class selector beats type selector', () => {
    const doc = parseHTML('<body><p class="a">x</p></body>')
    const rules = parseCSS(`
      p { color: red; }
      .a { color: blue; }
    `)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBe('blue')
  })

  it('id selector beats class selector', () => {
    const doc = parseHTML('<body><p id="x" class="a">y</p></body>')
    const rules = parseCSS(`
      .a { color: blue; }
      #x { color: green; }
    `)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBe('green')
  })

  it('inline style beats <style> rules', () => {
    const doc = parseHTML('<body><p style="color: purple">y</p></body>')
    const rules = parseCSS(`
      p { color: red; }
      .a { color: blue; }
    `)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBe('purple')
  })

  it('inherits color from parent when not set on element', () => {
    const doc = parseHTML(
      `<body style="color: #333">
        <div><p>text</p></div>
      </body>`
    )
    const styles = computeStyles(doc, [])
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBe('#333')
  })

  it('inherits font-family from parent when not set on element', () => {
    const doc = parseHTML(
      `<body style="font-family: Arial, sans-serif">
        <div><p>text</p></div>
      </body>`
    )
    const styles = computeStyles(doc, [])
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    // css-tree normalises whitespace around commas; the cascade passes
    // through the raw value. Just check the family names are there.
    expect(p?.get('font-family')).toContain('Arial')
    expect(p?.get('font-family')).toContain('sans-serif')
  })

  it('element-set value beats inherited value', () => {
    const doc = parseHTML(
      `<body style="color: #333">
        <div style="color: #666">
          <p style="color: #999">text</p>
        </div>
      </body>`
    )
    const styles = computeStyles(doc, [])
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBe('#999')
  })

  it('combines multiple rules on the same element (last wins per property)', () => {
    const doc = parseHTML('<body><p class="a b">x</p></body>')
    const rules = parseCSS(`
      .a { color: red; font-size: 14px; }
      .b { color: blue; font-weight: bold; }
    `)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    // Both classes have same specificity, but .b comes later → wins for shared prop
    expect(p?.get('color')).toBe('blue')
    expect(p?.get('font-size')).toBe('14px')
    expect(p?.get('font-weight')).toBe('bold')
  })

  it('stores style map for every element in the tree', () => {
    const doc = parseHTML('<body><div><p>x</p></div></body>')
    const styles = computeStyles(doc, [])
    // body + div + p
    expect(styles.size).toBeGreaterThanOrEqual(3)
  })

  it('does not apply a class selector when the element does not have that class', () => {
    const doc = parseHTML('<body><p>x</p></body>')
    const rules = parseCSS(`.a { color: red; }`)
    const styles = computeStyles(doc, rules)
    const p = getStyleFor(styles, doc, e => e.tagName === 'p')
    expect(p?.get('color')).toBeUndefined()
  })
})

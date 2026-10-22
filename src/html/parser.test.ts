// Tests for src/html/parser.ts
//
// parse5-based HTML parser wrapper. Goal: a stable, type-friendly DOM
// tree that downstream code (CSS cascade, converters) can walk without
// touching parse5 directly.

import { parseHTML, getTagName, getAttr, getChildren, getTextContent, walkTree, findByTag } from './parser'

describe('parseHTML', () => {
  it('parses a minimal HTML document and exposes html/body/head', () => {
    const html = `<!doctype html>
<html>
  <head><title>t</title></head>
  <body><p>hi</p></body>
</html>`
    const doc = parseHTML(html)

    expect(doc.root.tagName).toBe('html')
    expect(doc.head.tagName).toBe('head')
    expect(doc.body.tagName).toBe('body')
  })

  it('exposes style blocks from <head> as a list of raw CSS strings', () => {
    const html = `<html>
      <head>
        <style>.a { color: red; }</style>
        <style>.b { color: blue; }</style>
      </head>
      <body></body>
    </html>`
    const doc = parseHTML(html)

    expect(doc.styleBlocks).toHaveLength(2)
    expect(doc.styleBlocks[0]).toContain('.a')
    expect(doc.styleBlocks[1]).toContain('.b')
  })

  it('returns empty styleBlocks when no <style> elements', () => {
    const doc = parseHTML('<html><head></head><body></body></html>')
    expect(doc.styleBlocks).toEqual([])
  })

  it('handles an HTML fragment by wrapping in a synthetic <body>', () => {
    const doc = parseHTML('<p>just a paragraph</p>')
    expect(doc.body.tagName).toBe('body')
    // The fragment is the only child of <body>
    expect(getChildren(doc.body)).toHaveLength(1)
  })
})

describe('getTagName / getAttr / getTextContent', () => {
  it('returns lowercase tag name', () => {
    const doc = parseHTML('<body><H1>X</H1></body>')
    const h1 = getChildren(doc.body)[0]
    expect(getTagName(h1)).toBe('h1')
  })

  it('reads attributes by name', () => {
    const doc = parseHTML('<body><div id="x" class="a b">z</div></body>')
    const div = getChildren(doc.body)[0]
    expect(getAttr(div, 'id')).toBe('x')
    expect(getAttr(div, 'class')).toBe('a b')
    expect(getAttr(div, 'missing')).toBeUndefined()
  })

  it('returns concatenated text for a leaf with text content', () => {
    const doc = parseHTML('<body><p>hello world</p></body>')
    const p = getChildren(doc.body)[0]
    expect(getTextContent(p)).toBe('hello world')
  })

  it('returns empty string for an element with no text', () => {
    const doc = parseHTML('<body><div></div></body>')
    const div = getChildren(doc.body)[0]
    expect(getTextContent(div)).toBe('')
  })
})

describe('walkTree', () => {
  it('visits every element in document order', () => {
    const html = `<body>
      <div><p>a</p><p>b</p></div>
      <ul><li>1</li><li>2</li></ul>
    </body>`
    const doc = parseHTML(html)
    const tags: string[] = []
    walkTree(doc.body, node => {
      if (node.type === 'element') tags.push(node.tagName)
    })
    expect(tags).toEqual(['div', 'p', 'p', 'ul', 'li', 'li'])
  })

  it('skips text nodes by default; visit them when requested', () => {
    const doc = parseHTML('<body><p>hi <b>there</b></p></body>')
    const all: string[] = []
    walkTree(doc.body, node => {
      if (node.type === 'element') all.push(node.tagName)
      else if (node.type === 'text') all.push(`#text:${node.text}`)
    })
    expect(all).toEqual(['p', '#text:hi ', 'b', '#text:there'])
  })
})

describe('findByTag', () => {
  it('returns all descendants matching a tag name', () => {
    const doc = parseHTML(`
      <body>
        <div><p>1</p><p>2</p></div>
        <section><p>3</p></section>
      </body>
    `)
    const ps = findByTag(doc.body, 'p')
    expect(ps).toHaveLength(3)
    expect(ps.map(p => getTextContent(p))).toEqual(['1', '2', '3'])
  })

  it('returns empty array when no matches', () => {
    const doc = parseHTML('<body><div></div></body>')
    expect(findByTag(doc.body, 'h1')).toEqual([])
  })
})

describe('inline <svg> handling', () => {
  it('keeps inline svg as an element with tagName "svg" and namespace-agnostic attrs', () => {
    // parse5's HTML5 parser keeps inline svg as a regular element when
    // the foreign-content rules allow it; we don't namespace for now.
    const doc = parseHTML(`
      <body>
        <svg width="100" height="50" viewBox="0 0 100 50">
          <circle cx="50" cy="25" r="20" fill="red"/>
        </svg>
      </body>
    `)
    const svg = findByTag(doc.body, 'svg')[0]
    expect(svg).toBeDefined()
    expect(getAttr(svg, 'width')).toBe('100')
    expect(getAttr(svg, 'viewBox')).toBe('0 0 100 50')
    expect(findByTag(svg, 'circle')).toHaveLength(1)
  })
})

describe('void elements (br, hr, img, input)', () => {
  it('treats <br> as an empty element with no children', () => {
    const doc = parseHTML('<body>line1<br>line2</body>')
    const children = getChildren(doc.body)
    expect(children).toHaveLength(1)
    const br = children[0]
    expect(getTagName(br)).toBe('br')
    expect(getChildren(br)).toEqual([])
  })

  it('reads <img> attributes even though it is void', () => {
    const doc = parseHTML('<body><img src="a.png" alt="x" width="100"></body>')
    const img = getChildren(doc.body)[0]
    expect(getTagName(img)).toBe('img')
    expect(getAttr(img, 'src')).toBe('a.png')
    expect(getAttr(img, 'alt')).toBe('x')
  })
})

describe('comments and doctype', () => {
  it('ignores comments by default', () => {
    const doc = parseHTML('<body><!-- a comment --><p>hi</p></body>')
    // Only <p> should be a child
    expect(getChildren(doc.body)).toHaveLength(1)
    expect(getTagName(getChildren(doc.body)[0])).toBe('p')
  })

  it('tolerates <!doctype html> declarations', () => {
    expect(() => parseHTML('<!doctype html><html><body></body></html>')).not.toThrow()
  })
})

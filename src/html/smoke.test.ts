// End-to-end smoke test for HTML → SIF → PPTX
//
// This test exercises the full pipeline (not just the converter) by
// running it through the public htmlToPptxFile entry and asserting
// that a real PPTX file is written to disk. Each fixture generates
// its own file in a temp directory and asserts the file size > 1KB
// (the bare minimum for any pptxgenjs output).

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { htmlToPptxFile } from '../index'

const TMP = path.join(os.tmpdir(), 'svg-pptx-engine-html-tests')

describe('htmlToPptxFile end-to-end', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })
  })

  it('writes a real .pptx file for a simple heading + paragraph', async () => {
    const html = `<body style="width: 1280px; height: 720px">
      <h1>Hello</h1>
      <p>World</p>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'simple.pptx'))
    const size = fs.statSync(out).size
    expect(size).toBeGreaterThan(1024)
    expect(out.endsWith('.pptx')).toBe(true)
  })

  it('writes a real .pptx file for a card layout with shadow + border-radius', async () => {
    const html = `<body style="width: 1280px; height: 720px; background: #FAFAFA">
      <div style="display: flex; padding: 60px; gap: 24px">
        <div style="display: block; background: white; border: 1px solid #eee; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
          <h2>Card A</h2>
          <p>First card content.</p>
        </div>
        <div style="display: block; background: white; border: 1px solid #eee; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
          <h2>Card B</h2>
          <p>Second card content.</p>
        </div>
      </div>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'cards.pptx'))
    const size = fs.statSync(out).size
    expect(size).toBeGreaterThan(1024)
  })

  it('writes a real .pptx file for inline rich text', async () => {
    const html = `<body style="width: 1280px; height: 720px">
      <h1>Title with <b>bold</b> and <i>italic</i></h1>
      <p>This <span style="color: red">text</span> is mixed.</p>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'rich.pptx'))
    expect(fs.statSync(out).size).toBeGreaterThan(1024)
  })

  it('writes a real .pptx file for an unordered list', async () => {
    const html = `<body style="width: 1280px; height: 720px">
      <ul>
        <li>First item</li>
        <li>Second item</li>
        <li>Third item</li>
      </ul>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'list.pptx'))
    expect(fs.statSync(out).size).toBeGreaterThan(1024)
  })

  it('writes a real .pptx file for a flex row with images', async () => {
    const html = `<body style="width: 1280px; height: 720px; background: #FFFFFF">
      <div style="display: flex; gap: 24px; padding: 40px">
        <img src="https://example.com/a.png" style="width: 200px; height: 120px">
        <img src="https://example.com/b.png" style="width: 200px; height: 120px">
      </div>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'images.pptx'))
    expect(fs.statSync(out).size).toBeGreaterThan(1024)
  })

  it('writes a real .pptx file for a complete presentation page', async () => {
    const html = `<body style="width: 1280px; height: 720px; background: #F8FAFC">
      <div style="display: flex; flex-direction: column; padding: 64px; gap: 32px">
        <h1 style="color: #0F172A; font-size: 56px">Quarterly Report</h1>
        <p style="color: #475569; font-size: 20px">An overview of our <b>best</b> results.</p>
        <div style="display: flex; gap: 24px">
          <div style="display: block; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); flex: 1">
            <h3 style="color: #2563EB">Revenue</h3>
            <p>$1.2M</p>
          </div>
          <div style="display: block; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); flex: 1">
            <h3 style="color: #16A34A">Growth</h3>
            <p>+24%</p>
          </div>
        </div>
      </div>
    </body>`
    const out = await htmlToPptxFile(html, path.join(TMP, 'report.pptx'))
    expect(fs.statSync(out).size).toBeGreaterThan(1024)
  })
})
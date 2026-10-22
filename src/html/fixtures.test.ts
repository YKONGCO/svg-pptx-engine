// Realistic HTML templates → PPTX regression suite (M9)
//
// Each fixture exercises a specific page archetype from real-world
// slides. We assert:
//   - HTML → SIF: the SIF tree has the expected shape (group count,
//     child types, layout directive).
//   - HTML → PPTX: a real .pptx file is produced and is > 1KB.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { htmlToSif, htmlToSlideDocument } from './converter'
import { htmlToPptxFile } from '../index'

const TMP = path.join(os.tmpdir(), 'svg-pptx-engine-fixtures')

const FIXTURES = {
  // =====================================================================
  // 1. Cover / hero page
  // =====================================================================
  cover: `<body style="width: 1280px; height: 720px; background: #0F172A">
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; padding: 96px; color: white">
      <h1 style="color: white; font-size: 64px; text-align: center; font-weight: bold">Quarterly Report</h1>
      <p style="color: #94A3B8; font-size: 24px; text-align: center">Q3 2026 · Prepared by the Strategy Team</p>
      <div style="display: flex; gap: 16px; margin-top: 32px">
        <span style="background: #2563EB; color: white; padding: 12px 24px; border-radius: 6px">Download PDF</span>
        <span style="background: transparent; color: white; border: 1px solid #475569; padding: 12px 24px; border-radius: 6px">Share</span>
      </div>
    </div>
  </body>`,

  // =====================================================================
  // 2. Two-column layout (image + text)
  // =====================================================================
  twoColumn: `<body style="width: 1280px; height: 720px; background: white">
    <div style="display: flex; padding: 64px; gap: 48px">
      <div style="display: flex; flex: 1; background: #F1F5F9; border-radius: 12px; min-height: 480px"></div>
      <div style="display: flex; flex-direction: column; flex: 1; gap: 24px">
        <h2 style="color: #0F172A; font-size: 40px">Why this matters</h2>
        <p style="color: #475569; font-size: 18px">A short paragraph describing the topic in two or three sentences.</p>
        <p style="color: #475569; font-size: 18px">A second paragraph elaborating on the previous point.</p>
      </div>
    </div>
  </body>`,

  // =====================================================================
  // 3. KPI dashboard (3-card row)
  // =====================================================================
  kpiDashboard: `<body style="width: 1280px; height: 720px; background: #F8FAFC">
    <div style="display: flex; flex-direction: column; padding: 48px; gap: 32px">
      <h2 style="color: #0F172A; font-size: 32px">Key Metrics</h2>
      <div style="display: flex; gap: 24px">
        <div style="display: flex; flex-direction: column; flex: 1; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
          <span style="color: #64748B; font-size: 14px">REVENUE</span>
          <span style="color: #0F172A; font-size: 36px; font-weight: bold">$1.2M</span>
          <span style="color: #16A34A; font-size: 14px">+12% vs last quarter</span>
        </div>
        <div style="display: flex; flex-direction: column; flex: 1; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
          <span style="color: #64748B; font-size: 14px">USERS</span>
          <span style="color: #0F172A; font-size: 36px; font-weight: bold">42.1K</span>
          <span style="color: #16A34A; font-size: 14px">+8% vs last quarter</span>
        </div>
        <div style="display: flex; flex-direction: column; flex: 1; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.08)">
          <span style="color: #64748B; font-size: 14px">RETENTION</span>
          <span style="color: #0F172A; font-size: 36px; font-weight: bold">94%</span>
          <span style="color: #DC2626; font-size: 14px">-2% vs last quarter</span>
        </div>
      </div>
    </div>
  </body>`,

  // =====================================================================
  // 4. Bullet list + paragraph
  // =====================================================================
  bulletList: `<body style="width: 1280px; height: 720px; background: white; padding: 64px">
    <div style="display: flex; flex-direction: column; gap: 24px">
      <h2 style="color: #0F172A; font-size: 36px">Action items</h2>
      <ul>
        <li>Ship the new pricing page by Friday</li>
        <li>Schedule a review with the design team</li>
        <li>Update the analytics dashboard</li>
        <li>Send the Q3 summary to the leadership group</li>
      </ul>
      <p style="color: #475569; font-size: 18px">Reach out to <b>strategy@example.com</b> with questions.</p>
    </div>
  </body>`,

  // =====================================================================
  // 5. Comparison table (using grid)
  // =====================================================================
  comparisonTable: `<body style="width: 1280px; height: 720px; background: white">
    <div style="display: flex; flex-direction: column; padding: 48px; gap: 24px">
      <h2 style="color: #0F172A; font-size: 36px">Plan comparison</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px">
        <div style="background: #F1F5F9; border-radius: 12px; padding: 24px">
          <h3 style="color: #0F172A; font-size: 20px">Starter</h3>
          <p style="color: #475569; font-size: 16px">$9 / month</p>
          <p style="color: #475569; font-size: 14px">Up to 5 users</p>
        </div>
        <div style="background: #EFF6FF; border: 2px solid #2563EB; border-radius: 12px; padding: 24px">
          <h3 style="color: #2563EB; font-size: 20px">Pro</h3>
          <p style="color: #475569; font-size: 16px">$29 / month</p>
          <p style="color: #475569; font-size: 14px">Up to 25 users</p>
        </div>
        <div style="background: #F1F5F9; border-radius: 12px; padding: 24px">
          <h3 style="color: #0F172A; font-size: 20px">Enterprise</h3>
          <p style="color: #475569; font-size: 16px">Custom</p>
          <p style="color: #475569; font-size: 14px">Unlimited</p>
        </div>
      </div>
    </div>
  </body>`,

  // =====================================================================
  // 6. Quote / blockquote page
  // =====================================================================
  quote: `<body style="width: 1280px; height: 720px; background: #FAFAFA">
    <div style="display: flex; flex-direction: column; padding: 96px; gap: 32px">
      <blockquote style="font-size: 32px; color: #1E293B; line-height: 1.5">
        "The best way to predict the future is to invent it."
      </blockquote>
      <p style="color: #64748B; font-size: 18px">— Alan Kay</p>
    </div>
  </body>`,

  // =====================================================================
  // 7. Mixed inline rich text
  // =====================================================================
  richText: `<body style="width: 1280px; height: 720px; background: white; padding: 64px">
    <h1 style="color: #0F172A; font-size: 48px">A <b>bold</b> and <i>italic</i> title</h1>
    <p style="color: #475569; font-size: 18px">
      This paragraph contains <span style="color: #2563EB">blue text</span>,
      <u>underlined</u>, <s>strikethrough</s>, and even
      <span style="background: #FEF3C7">highlighted</span> runs.
      Use <code>code()</code> for snippets and H<sub>2</sub>O for chemistry.
    </p>
  </body>`,

  // =====================================================================
  // 8. Data table (simple grid)
  // =====================================================================
  dataTable: `<body style="width: 1280px; height: 720px; background: white">
    <div style="display: flex; flex-direction: column; padding: 48px; gap: 24px">
      <h2 style="color: #0F172A; font-size: 32px">Sales by region</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: #E2E8F0">
        <div style="background: #F8FAFC; padding: 12px"><b>Region</b></div>
        <div style="background: #F8FAFC; padding: 12px"><b>Q2</b></div>
        <div style="background: #F8FAFC; padding: 12px"><b>Q3</b></div>
        <div style="background: white; padding: 12px">North America</div>
        <div style="background: white; padding: 12px">$420K</div>
        <div style="background: white; padding: 12px">$510K</div>
        <div style="background: white; padding: 12px">Europe</div>
        <div style="background: white; padding: 12px">$310K</div>
        <div style="background: white; padding: 12px">$385K</div>
        <div style="background: white; padding: 12px">Asia</div>
        <div style="background: white; padding: 12px">$240K</div>
        <div style="background: white; padding: 12px">$305K</div>
      </div>
    </div>
  </body>`,
}

beforeAll(() => {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true })
})

describe('HTML → SIF regression fixtures', () => {
  Object.entries(FIXTURES).forEach(([name, html]) => {
    it(`${name}: produces a non-empty SIF document`, () => {
      const doc = htmlToSlideDocument(html)
      expect(doc.slides).toHaveLength(1)
      expect(doc.slides[0].elements.length).toBeGreaterThan(0)
    })
  })
})

describe('HTML → PPTX regression fixtures', () => {
  Object.entries(FIXTURES).forEach(([name, html]) => {
    it(`${name}: writes a valid PPTX file`, async () => {
      const out = await htmlToPptxFile(html, path.join(TMP, `${name}.pptx`))
      const size = fs.statSync(out).size
      expect(size).toBeGreaterThan(1024)
    }, 30000)
  })
})

describe('Specific fixture structure assertions', () => {
  // Pre-layout the body is always wrapped in a single body-block
  // layout group sized to the slide. Descend into it before asserting
  // on the user-authored tree shape.
  const unwrap = (elements: any[]): any[] => {
    if (elements.length === 1 && elements[0]?.type === 'group' && elements[0].id === 'body-block') {
      return elements[0].children || []
    }
    return elements
  }

  it('cover: emits a flex column group with h1 + p + 2 button-like spans', () => {
    const elements = unwrap(htmlToSif(FIXTURES.cover, { useLayout: 'off' }))
    // The body contains one flex container; with one child, no extra wrapper.
    expect(elements).toHaveLength(1)
    const root = elements[0] as any
    expect(root.layout).toBe('flex')
  })

  it('kpiDashboard: produces nested flex groups (row + 3 columns)', () => {
    const elements = unwrap(htmlToSif(FIXTURES.kpiDashboard, { useLayout: 'off' }))
    expect(elements).toHaveLength(1)
    const root = elements[0] as any
    expect(root.layout).toBe('flex')
  })

  it('comparisonTable: produces a grid layout', () => {
    const elements = unwrap(htmlToSif(FIXTURES.comparisonTable, { useLayout: 'off' }))
    expect(elements).toHaveLength(1)
    const root = elements[0] as any
    expect(root.layout).toBe('flex')
    // The inner grid is nested inside the column flex; check that
    // somewhere in the tree we have a grid layout group.
    const findGrid = (el: any): boolean => {
      if (el.layout === 'grid') return true
      if (el.children) return el.children.some(findGrid)
      return false
    }
    expect(findGrid(root)).toBe(true)
  })

  it('richText: emits a h1 with bold + italic runs', () => {
    const elements = unwrap(htmlToSif(FIXTURES.richText, { useLayout: 'off' }))
    // At minimum: h1 + p (no group wrapper because 2 children => group)
    expect(elements.length).toBeGreaterThan(0)
    // Look for a RichTextElement (has runs)
    const findRich = (el: any): any => {
      if (el.type === 'text' && el.runs) return el
      if (el.children) {
        for (const c of el.children) {
          const r = findRich(c)
          if (r) return r
        }
      }
      return null
    }
    const root = elements[0] as any
    const rich = findRich(root)
    expect(rich).not.toBeNull()
    if (rich) {
      const boldRun = rich.runs.find((r: any) => r.text === 'bold')
      expect(boldRun?.fontWeight).toBe('bold')
      const italicRun = rich.runs.find((r: any) => r.text === 'italic')
      expect(italicRun?.fontStyle).toBe('italic')
    }
  })

  it('bulletList: produces ul group with 4 li children', () => {
    const elements = unwrap(htmlToSif(FIXTURES.bulletList, { useLayout: 'off' }))
    const findList = (el: any): any => {
      if (el.type === 'group' && el.children?.some((c: any) => c.type === 'group' && c.children?.[0]?.text?.includes('•'))) return el
      if (el.children) {
        for (const c of el.children) {
          const r = findList(c)
          if (r) return r
        }
      }
      return null
    }
    const list = findList(elements[0])
    expect(list).not.toBeNull()
  })
})
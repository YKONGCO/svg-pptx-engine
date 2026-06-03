import { jsonToPptx, PROTOCOL_VERSION, svgToPptx, svgToSlideDocument } from '../src'

describe('Public API', () => {
  it('creates a slide document from svg content', () => {
    const document = svgToSlideDocument(`
      <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="20" width="100" height="50" fill="#2563eb" />
      </svg>
    `)

    expect(document.version).toBe(PROTOCOL_VERSION)
    expect(document.width).toBe(320)
    expect(document.height).toBe(180)
    expect(document.slides).toHaveLength(1)
    expect(document.slides[0].elements).toHaveLength(1)
  })

  it('converts svg content to a pptx buffer through the public api', async () => {
    const result = await svgToPptx(`
      <svg width="200" height="100" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="200" height="100" fill="#16a34a" />
      </svg>
    `, { outputType: 'uint8array' })

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
  })

  it('converts json content to a pptx buffer through the public api', async () => {
    const result = await jsonToPptx({
      version: '1.0.0',
      width: 320,
      height: 180,
      slides: [
        {
          id: 'slide-1',
          elements: []
        }
      ]
    }, { outputType: 'uint8array' })

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)
  })
})

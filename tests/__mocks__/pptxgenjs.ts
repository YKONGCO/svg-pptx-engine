// Mock for pptxgenjs

class MockPptxGenJS {
  author = ''
  company = ''
  title = ''
  subject = ''
  revision = '1'
  layout = 'LAYOUT_16x9'
  rtlMode = false

  addSlide() {
    return {
      background: {},
      addText: jest.fn(),
      addImage: jest.fn(),
      addMedia: jest.fn(),
      addShape: jest.fn()
    }
  }

  writeFile = jest.fn().mockResolvedValue('mock.pptx')
  write = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
  defineLayout = jest.fn()
}

const mockPptxGenJS = MockPptxGenJS as any
mockPptxGenJS.ShapeType = {
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line',
  pentagon: 'pentagon',
  hexagon: 'hexagon'
}
mockPptxGenJS.ShapeName = {
  rect: 'rect',
  ellipse: 'ellipse'
}

export default MockPptxGenJS

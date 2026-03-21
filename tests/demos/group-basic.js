// Basic Group Demo - shapes, text combined

const PptxGenJS = require('../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Basic Group Demo', { x: 0.5, y: 0.3, fontSize: 28, bold: true })

// Create a basic group with shapes and text
const group1 = slide.addGroup()
group1.addShape('rect', { x: 1, y: 1, w: 2, h: 1.5, fill: { color: '4A90D9' }, line: { color: '2E5090', width: 2 } })
group1.addShape('ellipse', { x: 1.5, y: 0.3, w: 1.2, h: 1.2, fill: { color: 'F5A623' }, line: { color: 'D5860D', width: 2 } })
group1.addText('Hello', { x: 0, y: 1.7, w: 2, h: 0.5, fontSize: 12, color: 'FFFFFF' })

// Another group with rounded rectangle background
const group2 = slide.addGroup()
group2.addShape('roundRect', { x: 0, y: 0, w: 4, h: 2.5, fill: { color: 'FFFFFF' }, line: { color: 'CCCCCC', width: 1 }, shadow: { type: 'outer', blur: 3, offset: 2, angle: 45, color: '000000' } })
group2.addText('Grouped Text', { x: 0.2, y: 0.2, w: 3.5, h: 0.5, fontSize: 16, bold: true, color: '333333' })
group2.addText('This text is inside a group with a rounded rectangle.', { x: 0.2, y: 0.8, w: 3.5, h: 1.5, fontSize: 12, color: '666666' })

// Standalone shapes for comparison
slide.addShape('diamond', { x: 1, y: 4.5, w: 1.5, h: 1.5, fill: { color: '7ED321' }, line: { color: '5B9A1F', width: 2 } })
slide.addText('Standalone Diamond', { x: 0.5, y: 6.2, w: 2.5, h: 0.4, fontSize: 10 })

// Group with the diamond
const group3 = slide.addGroup()
group3.addShape('rect', { x: 0, y: 0, w: 2.5, h: 2, fill: { color: 'E8E8E8' }, line: { color: 'CCCCCC', width: 1 } })
group3.addText('Grouped Diamond', { x: 0, y: 0.7, w: 2.5, h: 0.6, fontSize: 12, color: '333333' })

pptx.writeFile({ fileName: 'output/group-basic.pptx' })
    .then(() => console.log('Created output/group-basic.pptx'))
    .catch(err => console.error('Error:', err))

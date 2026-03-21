// Group Chaining Demo - Fluent API

const PptxGenJS = require('../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Group Chaining Demo', { x: 0.5, y: 0.2, fontSize: 28, bold: true })
slide.addText('All methods return the group for chaining', { x: 0.5, y: 0.6, fontSize: 14, color: '666666' })

// Fluent API demonstration - method chaining
slide.addGroup()
    .addShape('rect', { x: 0.5, y: 1, w: 3, h: 2, fill: { color: '4A90D9' }, line: { color: '2E5090', width: 2 } })
    .addShape('ellipse', { x: 1, y: 0.5, w: 1.5, h: 1.5, fill: { color: 'F5A623' }, line: { color: 'D5860D', width: 2 } })
    .addText('Chained Group 1', { x: 0, y: 2.1, w: 3, h: 0.5, fontSize: 12, color: '333333', align: 'center' })

// Another chained group
slide.addGroup()
    .addShape('roundRect', { x: 0, y: 0, w: 4, h: 1.5, fill: { color: '27AE60' }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
    .addText('Success Card', { x: 0.3, y: 0.3, w: 3.5, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF' })
    .addText('Operation completed successfully!', { x: 0.3, y: 0.8, w: 3.5, h: 0.5, fontSize: 12, color: 'FFFFFF' })
    .options = { x: 4, y: 1 }

// Warning card
slide.addGroup()
    .addShape('roundRect', { x: 0, y: 0, w: 4, h: 1.5, fill: { color: 'F39C12' } })
    .addText('Warning Card', { x: 0.3, y: 0.3, w: 3.5, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF' })
    .addText('Please review the items below.', { x: 0.3, y: 0.8, w: 3.5, h: 0.5, fontSize: 12, color: 'FFFFFF' })
    .options = { x: 0.5, y: 2.8 }

// Error card
slide.addGroup()
    .addShape('roundRect', { x: 0, y: 0, w: 4, h: 1.5, fill: { color: 'E74C3C' } })
    .addText('Error Card', { x: 0.3, y: 0.3, w: 3.5, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF' })
    .addText('Something went wrong!', { x: 0.3, y: 0.8, w: 3.5, h: 0.5, fontSize: 12, color: 'FFFFFF' })
    .options = { x: 4.5, y: 2.8 }

// Info card
slide.addGroup()
    .addShape('roundRect', { x: 0, y: 0, w: 4, h: 1.5, fill: { color: '3498DB' } })
    .addText('Info Card', { x: 0.3, y: 0.3, w: 3.5, h: 0.5, fontSize: 18, bold: true, color: 'FFFFFF' })
    .addText('Here is some useful information.', { x: 0.3, y: 0.8, w: 3.5, h: 0.5, fontSize: 12, color: 'FFFFFF' })
    .options = { x: 0.5, y: 4.6 }

// Stats group with multiple elements
slide.addGroup()
    .addShape('rect', { x: 0, y: 0, w: 9, h: 1.2, fill: { color: '2C3E50' } })
    .addText('STATISTICS', { x: 0.3, y: 0.35, w: 2, h: 0.5, fontSize: 14, bold: true, color: 'FFFFFF' })
    .addShape('rect', { x: 2.5, y: 0.2, w: 1.5, h: 0.8, fill: { color: '27AE60' } })
    .addText('+25%', { x: 2.5, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    .addShape('rect', { x: 4.3, y: 0.2, w: 1.5, h: 0.8, fill: { color: '3498DB' } })
    .addText('150', { x: 4.3, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    .addShape('rect', { x: 6.1, y: 0.2, w: 1.5, h: 0.8, fill: { color: '9B59B6' } })
    .addText('89%', { x: 6.1, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    .addShape('rect', { x: 7.9, y: 0.2, w: 0.8, h: 0.8, fill: { color: 'E74C3C' } })
    .addText('12', { x: 7.9, y: 0.2, w: 0.8, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    .options = { x: 0.5, y: 6.2 }

pptx.writeFile({ fileName: 'output/group-chaining.pptx' })
    .then(() => console.log('Created output/group-chaining.pptx'))
    .catch(err => console.error('Error:', err))

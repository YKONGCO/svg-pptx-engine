// Complex Group Composition Demo

const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Complex Group Composition', { x: 0.5, y: 0.2, fontSize: 28, bold: true })

// Icon-like group: Circle with checkmark
const checkIcon = slide.addGroup()
checkIcon.addShape('ellipse', { x: 0, y: 0, w: 1.2, h: 1.2, fill: { color: '27AE60' } })
checkIcon.addShape('rect', { x: 0.25, y: 0.55, w: 0.3, h: 0.6, fill: { color: 'FFFFFF' }, rotate: -45 })
checkIcon.addShape('rect', { x: 0.45, y: 0.35, w: 0.2, h: 0.8, fill: { color: 'FFFFFF' }, rotate: 35 })
checkIcon.options = { x: 5, y: 0.5 }

// Info icon: Circle with "i"
const infoIcon = slide.addGroup()
infoIcon.addShape('ellipse', { x: 0, y: 0, w: 1.2, h: 1.2, fill: { color: '3498DB' } })
infoIcon.addText('i', { x: 0, y: 0, w: 1.2, h: 1.2, fontSize: 36, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
infoIcon.options = { x: 6.7, y: 0.5 }

// Warning icon: Circle with "!"
const warnIcon = slide.addGroup()
warnIcon.addShape('ellipse', { x: 0, y: 0, w: 1.2, h: 1.2, fill: { color: 'F39C12' } })
warnIcon.addText('!', { x: 0, y: 0, w: 1.2, h: 1.2, fontSize: 32, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
warnIcon.options = { x: 8.4, y: 0.5 }

// Chart-like group
const chartGroup = slide.addGroup()
chartGroup.addShape('rect', { x: 0, y: 0, w: 4, h: 2.5, fill: { color: 'FAFAFA' }, line: { color: 'E0E0E0', width: 1 } })
// Bar 1
chartGroup.addShape('rect', { x: 0.3, y: 1.5, w: 0.5, h: 0.8, fill: { color: '4A90D9' } })
// Bar 2
chartGroup.addShape('rect', { x: 1, y: 1, w: 0.5, h: 1.3, fill: { color: '5CAB7D' } })
// Bar 3
chartGroup.addShape('rect', { x: 1.7, y: 0.7, w: 0.5, h: 1.6, fill: { color: 'F5A623' } })
// Bar 4
chartGroup.addShape('rect', { x: 2.4, y: 1.2, w: 0.5, h: 1.1, fill: { color: 'E74C3C' } })
// X-axis line
chartGroup.addShape('rect', { x: 0.2, y: 2.3, w: 3.6, h: 0.05, fill: { color: '333333' } })
chartGroup.addText('Sales Chart', { x: 0.2, y: 0.1, w: 3.5, h: 0.4, fontSize: 12, bold: true, color: '333333' })
chartGroup.options = { x: 5, y: 2 }

// Avatar-like group
const avatar = slide.addGroup()
avatar.addShape('ellipse', { x: 0, y: 0, w: 1.5, h: 1.5, fill: { color: '9B59B6' } })
avatar.addShape('ellipse', { x: 0.375, y: 0.3, w: 0.75, h: 0.6, fill: { color: 'FFFFFF' } })
avatar.addShape('ellipse', { x: 0.2, y: 1, w: 1.1, h: 0.5, fill: { color: 'FFFFFF' } })
avatar.options = { x: 0.5, y: 3.5 }

// Progress bar group
const progressGroup = slide.addGroup()
progressGroup.addShape('rect', { x: 0, y: 0, w: 4, h: 0.4, fill: { color: 'E0E0E0' }, line: { color: 'CCCCCC', width: 1 } })
progressGroup.addShape('rect', { x: 0, y: 0, w: 3, h: 0.4, fill: { color: '27AE60' } })
progressGroup.addText('75%', { x: 0, y: 0, w: 4, h: 0.4, fontSize: 10, color: 'FFFFFF', align: 'center', valign: 'middle' })
progressGroup.options = { x: 2.5, y: 3.8 }

// Combined: Card with icon and progress
const complexCard = slide.addGroup()
complexCard.addShape('roundRect', { x: 0, y: 0, w: 4.5, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 3, offset: 2, angle: 45, color: '000000' } })
complexCard.addShape('ellipse', { x: 0.3, y: 0.3, w: 0.8, h: 0.8, fill: { color: '27AE60' } })
complexCard.addText('Task Complete', { x: 1.3, y: 0.4, w: 3, h: 0.5, fontSize: 16, bold: true, color: '333333' })
complexCard.addShape('rect', { x: 0.3, y: 1.3, w: 4, h: 0.3, fill: { color: 'E0E0E0' } })
complexCard.addShape('rect', { x: 0.3, y: 1.3, w: 3.2, h: 0.3, fill: { color: '27AE60' } })
complexCard.options = { x: 0.5, y: 5 }

// Stats group with multiple elements
const statsGroup = slide.addGroup()
statsGroup.addShape('rect', { x: 0, y: 0, w: 9, h: 1.2, fill: { color: '2C3E50' } })
statsGroup.addText('STATISTICS', { x: 0.3, y: 0.35, w: 2, h: 0.5, fontSize: 14, bold: true, color: 'FFFFFF' })
statsGroup.addShape('rect', { x: 2.5, y: 0.2, w: 1.5, h: 0.8, fill: { color: '27AE60' } })
statsGroup.addText('+25%', { x: 2.5, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
statsGroup.addShape('rect', { x: 4.3, y: 0.2, w: 1.5, h: 0.8, fill: { color: '3498DB' } })
statsGroup.addText('150', { x: 4.3, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
statsGroup.addShape('rect', { x: 6.1, y: 0.2, w: 1.5, h: 0.8, fill: { color: '9B59B6' } })
statsGroup.addText('89%', { x: 6.1, y: 0.2, w: 1.5, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
statsGroup.addShape('rect', { x: 7.9, y: 0.2, w: 0.8, h: 0.8, fill: { color: 'E74C3C' } })
statsGroup.addText('12', { x: 7.9, y: 0.2, w: 0.8, h: 0.8, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
statsGroup.options = { x: 0.5, y: 7 }

pptx.writeFile({ fileName: 'output/group-complex.pptx' })
    .then(() => console.log('Created output/group-complex.pptx'))
    .catch(err => console.error('Error:', err))

// Multiple Groups on Same Slide Demo

const PptxGenJS = require('../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Multiple Groups Demo', { x: 0.5, y: 0.2, fontSize: 28, bold: true })
slide.addText('Each card is a separate group', { x: 0.5, y: 0.6, fontSize: 14, color: '666666' })

// Card 1 - Top Left
const card1 = slide.addGroup()
card1.addShape('roundRect', { x: 0, y: 0, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card1.addShape('rect', { x: 0.2, y: 0.2, w: 0.6, h: 0.6, fill: { color: '4A90D9' } })
card1.addText('Card Title 1', { x: 0.2, y: 1, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card1.addText('Description text for card 1', { x: 0.2, y: 1.4, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

// Card 2 - Top Middle
const card2 = slide.addGroup()
card2.addShape('roundRect', { x: 3.1, y: 0, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card2.addShape('ellipse', { x: 3.3, y: 0.3, w: 0.5, h: 0.5, fill: { color: 'F5A623' } })
card2.addText('Card Title 2', { x: 3.3, y: 1, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card2.addText('Description text for card 2', { x: 3.3, y: 1.4, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

// Card 3 - Top Right
const card3 = slide.addGroup()
card3.addShape('roundRect', { x: 6.2, y: 0, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card3.addShape('rect', { x: 6.4, y: 0.2, w: 0.6, h: 0.6, fill: { color: '7ED321' }, rotate: 45 })
card3.addText('Card Title 3', { x: 6.4, y: 1, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card3.addText('Description text for card 3', { x: 6.4, y: 1.4, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

// Bottom row cards
// Card 4 - Bottom Left
const card4 = slide.addGroup()
card4.addShape('roundRect', { x: 0, y: 2.3, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card4.addShape('rect', { x: 0.2, y: 2.5, w: 0.6, h: 0.6, fill: { color: '9B59B6' } })
card4.addText('Card Title 4', { x: 0.2, y: 3.3, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card4.addText('Description text for card 4', { x: 0.2, y: 3.7, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

// Card 5 - Bottom Middle
const card5 = slide.addGroup()
card5.addShape('roundRect', { x: 3.1, y: 2.3, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card5.addShape('ellipse', { x: 3.3, y: 2.5, w: 0.5, h: 0.5, fill: { color: 'E74C3C' } })
card5.addText('Card Title 5', { x: 3.3, y: 3.3, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card5.addText('Description text for card 5', { x: 3.3, y: 3.7, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

// Card 6 - Bottom Right
const card6 = slide.addGroup()
card6.addShape('roundRect', { x: 6.2, y: 2.3, w: 2.8, h: 2, fill: { color: 'FFFFFF' }, line: { color: 'E0E0E0', width: 1 }, shadow: { type: 'outer', blur: 2, offset: 2, angle: 45, color: '000000' } })
card6.addShape('rect', { x: 6.4, y: 2.5, w: 0.6, h: 0.6, fill: { color: '3498DB' } })
card6.addText('Card Title 6', { x: 6.4, y: 3.3, w: 2.4, h: 0.4, fontSize: 14, bold: true, color: '333333' })
card6.addText('Description text for card 6', { x: 6.4, y: 3.7, w: 2.4, h: 0.5, fontSize: 10, color: '666666' })

pptx.writeFile({ fileName: 'output/group-multiple.pptx' })
    .then(() => console.log('Created output/group-multiple.pptx'))
    .catch(err => console.error('Error:', err))

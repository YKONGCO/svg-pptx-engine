// Group with Fill Styles Demo - Shadow and Gradient

const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Group Fill Styles Demo', { x: 0.5, y: 0.2, fontSize: 28, bold: true })
slide.addText('Testing shadow and gradient fills in groups', { x: 0.5, y: 0.6, fontSize: 14, color: '666666' })

// === ROW 1: Basic Fills ===

// Group with solid fill
const group1 = slide.addGroup()
group1.addShape('rect', { x: 0, y: 0, w: 2.8, h: 1.8, fill: { color: 'FF6B6B' }, line: { color: 'CC5555', width: 2 } })
group1.addText('Solid Fill', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group1.options = { x: 0.3, y: 1.0 }

// Group with transparent fill
const group2 = slide.addGroup()
group2.addShape('rect', { x: 0, y: 0, w: 2.8, h: 1.8, fill: { color: '4ECDC4', transparency: 50 }, line: { color: '3BA99F', width: 2 } })
group2.addText('50% Transparent', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: '333333' })
group2.options = { x: 3.4, y: 1.0 }

// Group with layered shapes
const group3 = slide.addGroup()
group3.addShape('rect', { x: 0, y: 0, w: 2.8, h: 1.8, fill: { color: '95E1D3' }, line: { color: '76C9BC', width: 1 } })
group3.addShape('ellipse', { x: 0.8, y: 0.5, w: 1.5, h: 1, fill: { color: 'F38181', transparency: 30 } })
group3.addText('Layered', { x: 0.3, y: 2.0, w: 2.2, h: 0.4, fontSize: 12, color: '333333' })
group3.options = { x: 6.5, y: 1.0 }

// === ROW 2: Outlines and Shadows ===

// Group with outline only (no fill)
const group4 = slide.addGroup()
group4.addShape('rect', { x: 0, y: 0, w: 2.8, h: 1.8, fill: { type: 'none' }, line: { color: '333333', width: 3 } })
group4.addShape('ellipse', { x: 0.8, y: 0.4, w: 1.2, h: 1, fill: { type: 'none' }, line: { color: '333333', width: 3 } })
group4.addText('Outline Only', { x: 0.3, y: 2.0, w: 2.2, h: 0.4, fontSize: 12, color: '333333' })
group4.options = { x: 0.3, y: 3.0 }

// Group with shadow
const group5 = slide.addGroup()
group5.addShape('rect', {
    x: 0, y: 0, w: 2.8, h: 1.8,
    fill: { color: 'DDA0DD' },
    line: { color: 'BA55D3', width: 1 },
    shadow: { type: 'outer', blur: 5, offset: 3, angle: 45, color: '000000' }
})
group5.addText('With Shadow', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group5.options = { x: 3.4, y: 3.0 }

// Shadow on ellipse
const group6 = slide.addGroup()
group6.addShape('ellipse', {
    x: 0, y: 0, w: 2.8, h: 1.8,
    fill: { color: '3498DB' },
    shadow: { type: 'outer', blur: 6, offset: 4, angle: 135, color: '000000', opacity: 0.6 }
})
group6.addText('Shadow Ellipse', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group6.options = { x: 6.5, y: 3.0 }

// === ROW 3: Gradient Fills ===

// Gradient: red to blue horizontal
const group7 = slide.addGroup()
group7.addShape('rect', {
    x: 0, y: 0, w: 2.8, h: 1.8,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: 'FF0000' },
            { position: 100, color: '0000FF' }
        ],
        angle: 0
    }
})
group7.addText('Gradient 0°', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group7.options = { x: 0.3, y: 5.0 }

// Gradient: diagonal multi-color
const group8 = slide.addGroup()
group8.addShape('rect', {
    x: 0, y: 0, w: 2.8, h: 1.8,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: 'FF6B6B' },
            { position: 50, color: 'F39C12' },
            { position: 100, color: '27AE60' }
        ],
        angle: 45
    }
})
group8.addText('Gradient 45°', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group8.options = { x: 3.4, y: 5.0 }

// Gradient: vertical (top to bottom)
const group9 = slide.addGroup()
group9.addShape('rect', {
    x: 0, y: 0, w: 2.8, h: 1.8,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: '2C3E50' },
            { position: 100, color: '3498DB' }
        ],
        angle: 270
    }
})
group9.addText('Gradient 270°', { x: 0.3, y: 0.6, w: 2.2, h: 0.5, fontSize: 14, color: 'FFFFFF' })
group9.options = { x: 6.5, y: 5.0 }

pptx.writeFile({ fileName: 'output/group-fill-styles.pptx' })
    .then(() => console.log('Created output/group-fill-styles.pptx'))
    .catch(err => console.error('Error:', err))

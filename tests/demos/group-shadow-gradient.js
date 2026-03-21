// Group with Shadow and Gradient Fill Demo

const PptxGenJS = require('../packages/pptxgenjs/dist/pptxgen.cjs.js')

const pptx = new PptxGenJS()
pptx.layout = 'LAYOUT_16x9'

const slide = pptx.addSlide()
slide.addText('Group Shadow & Gradient Demo', { x: 0.5, y: 0.2, fontSize: 28, bold: true })

// === SHADOW TESTS ===

// Shadow test 1: Basic shadow
const shadowGroup1 = slide.addGroup()
shadowGroup1.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: '4A90D9' },
    line: { color: '2E5090', width: 2 },
    shadow: { type: 'outer', blur: 4, offset: 3, angle: 45, color: '000000' }
})
shadowGroup1.addText('Shadow: outer blur=4 offset=3', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup1.options = { x: 0.5, y: 1 }

// Shadow test 2: Shadow with different angle
const shadowGroup2 = slide.addGroup()
shadowGroup2.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: 'F5A623' },
    line: { color: 'D5860D', width: 2 },
    shadow: { type: 'outer', blur: 6, offset: 4, angle: 135, color: '000000' }
})
shadowGroup2.addText('Shadow: angle=135', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup2.options = { x: 3.8, y: 1 }

// Shadow test 3: Shadow with opacity
const shadowGroup3 = slide.addGroup()
shadowGroup3.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: '27AE60' },
    shadow: { type: 'outer', blur: 8, offset: 4, angle: 270, color: '000000', opacity: 0.5 }
})
shadowGroup3.addText('Shadow: opacity=0.5', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup3.options = { x: 7.1, y: 1 }

// Shadow test 4: Inner shadow
const shadowGroup4 = slide.addGroup()
shadowGroup4.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: '9B59B6' },
    shadow: { type: 'inner', blur: 4, offset: 2, angle: 45, color: '000000' }
})
shadowGroup4.addText('Shadow: inner type', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup4.options = { x: 0.5, y: 2.8 }

// Shadow test 5: Shadow with transparency on fill
const shadowGroup5 = slide.addGroup()
shadowGroup5.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: 'E74C3C', transparency: 30 },
    shadow: { type: 'outer', blur: 5, offset: 3, angle: 90, color: '333333' }
})
shadowGroup5.addText('Shadow + transparent fill', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup5.options = { x: 3.8, y: 2.8 }

// Shadow test 6: Complex shadow with ellipse
const shadowGroup6 = slide.addGroup()
shadowGroup6.addShape('ellipse', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: { color: '3498DB' },
    shadow: { type: 'outer', blur: 6, offset: 4, angle: 180, color: '000000' }
})
shadowGroup6.addText('Shadow on ellipse', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 11, color: 'FFFFFF' })
shadowGroup6.options = { x: 7.1, y: 2.8 }

// === GRADIENT TESTS ===

// Gradient test 1: Basic linear gradient
const gradientGroup1 = slide.addGroup()
gradientGroup1.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: 'FF0000' },
            { position: 100, color: '0000FF' }
        ],
        angle: 0
    }
})
gradientGroup1.addText('Gradient: 0 deg red->blue', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup1.options = { x: 0.5, y: 4.6 }

// Gradient test 2: Diagonal gradient
const gradientGroup2 = slide.addGroup()
gradientGroup2.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
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
gradientGroup2.addText('Gradient: 45 deg multi', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup2.options = { x: 3.8, y: 4.6 }

// Gradient test 3: Gradient with transparency
const gradientGroup3 = slide.addGroup()
gradientGroup3.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: '9B59B6', transparency: 20 },
            { position: 100, color: '3498DB', transparency: 50 }
        ],
        angle: 90
    }
})
gradientGroup3.addText('Gradient: transparent stops', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup3.options = { x: 7.1, y: 4.6 }

// Gradient test 4: Vertical gradient
const gradientGroup4 = slide.addGroup()
gradientGroup4.addShape('rect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: '2C3E50' },
            { position: 100, color: '3498DB' }
        ],
        angle: 270
    }
})
gradientGroup4.addText('Gradient: 270 deg (top->bottom)', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup4.options = { x: 0.5, y: 6.3 }

// Gradient test 5: Gradient on rounded rect
const gradientGroup5 = slide.addGroup()
gradientGroup5.addShape('roundRect', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: 'F1C40F' },
            { position: 100, color: 'E67E22' }
        ],
        angle: 180
    },
    shadow: { type: 'outer', blur: 3, offset: 2, angle: 45, color: '000000' }
})
gradientGroup5.addText('Gradient + shadow + roundRect', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup5.options = { x: 3.8, y: 6.3 }

// Gradient test 6: Gradient on ellipse
const gradientGroup6 = slide.addGroup()
gradientGroup6.addShape('ellipse', {
    x: 0, y: 0, w: 3, h: 1.5,
    fill: {
        type: 'linearGradient',
        stops: [
            { position: 0, color: '1ABC9C' },
            { position: 100, color: '16A085' }
        ],
        angle: 315
    }
})
gradientGroup6.addText('Gradient on ellipse', { x: 0.2, y: 0.5, w: 2.6, h: 0.5, fontSize: 10, color: 'FFFFFF' })
gradientGroup6.options = { x: 7.1, y: 6.3 }

pptx.writeFile({ fileName: 'output/group-shadow-gradient.pptx' })
    .then(() => console.log('Created output/group-shadow-gradient.pptx'))
    .catch(err => console.error('Error:', err))

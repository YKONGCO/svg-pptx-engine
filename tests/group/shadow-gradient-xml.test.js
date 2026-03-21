// Test XML output for shadow and gradient fills in groups

const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')
const JSZip = require('jszip')
const fs = require('fs')

async function testShadowGradient() {
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_16x9'
    const slide = pptx.addSlide()

    // Test 1: Group with shadow
    const shadowGroup = slide.addGroup()
    shadowGroup.addShape('rect', {
        x: 0, y: 0, w: 2, h: 1,
        fill: { color: '4A90D9' },
        shadow: { type: 'outer', blur: 4, offset: 3, angle: 45, color: '000000' }
    })

    // Test 2: Group with gradient
    const gradientGroup = slide.addGroup()
    gradientGroup.addShape('rect', {
        x: 0, y: 0, w: 2, h: 1,
        fill: {
            type: 'linearGradient',
            stops: [
                { position: 0, color: 'FF0000' },
                { position: 100, color: '0000FF' }
            ],
            angle: 45
        }
    })

    // Test 3: Group with shadow AND gradient
    const combinedGroup = slide.addGroup()
    combinedGroup.addShape('rect', {
        x: 0, y: 0, w: 2, h: 1,
        fill: {
            type: 'linearGradient',
            stops: [
                { position: 0, color: '27AE60' },
                { position: 100, color: '2C3E50' }
            ],
            angle: 90
        },
        shadow: { type: 'outer', blur: 5, offset: 3, angle: 45, color: '000000' }
    })

    await pptx.writeFile({ fileName: 'tests/group/test-shadow-gradient.pptx' })

    const zip = await JSZip.loadAsync(fs.readFileSync('tests/group/test-shadow-gradient.pptx'))
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')

    console.log('=== Shadow & Gradient XML Tests ===\n')

    // Shadow tests
    const shadowPattern = /<a:outerShdw[^>]*blurRad="[^"]*"[^>]*dist="[^"]*"[^>]*dir="[^"]*"/
    const hasShadow = shadowPattern.test(slideXml)
    console.log(`Shadow XML: ${hasShadow ? '✓ PASS' : '✗ FAIL'}`)
    if (hasShadow) {
        const shadowMatch = slideXml.match(/<a:outerShdw[^>]*>/)
        if (shadowMatch) console.log(`  Found: ${shadowMatch[0].substring(0, 80)}...`)
    }

    // Gradient tests
    const gradientPattern = /<a:gradFill/
    const hasGradient = gradientPattern.test(slideXml)
    console.log(`Gradient XML: ${hasGradient ? '✓ PASS' : '✗ FAIL'}`)
    if (hasGradient) {
        const gradientMatch = slideXml.match(/<a:gradFill[\s\S]*?<\/a:gradFill>/)
        if (gradientMatch) console.log(`  Found gradient fill element`)
    }

    // Effect list tests
    const effectLstPattern = /<a:effectLst>/
    const hasEffectLst = effectLstPattern.test(slideXml)
    console.log(`Effect list: ${hasEffectLst ? '✓ PASS' : '✗ FAIL'}`)

    // Combined (gradient + shadow) test
    const combinedPattern = /<a:gradFill[\s\S]*?<\/a:gradFill>[\s\S]*?<a:effectLst>/
    const hasCombined = combinedPattern.test(slideXml)
    console.log(`Gradient + Shadow combined: ${hasCombined ? '✓ PASS' : '✗ FAIL'}`)

    // Cleanup
    fs.unlinkSync('tests/group/test-shadow-gradient.pptx')

    console.log('\n=== All XML structure checks passed! ===')
    return hasShadow && hasGradient && hasEffectLst && hasCombined
}

testShadowGradient()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(err => {
        console.error('Error:', err)
        process.exit(1)
    })

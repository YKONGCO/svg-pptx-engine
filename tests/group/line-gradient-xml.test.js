const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')
const JSZip = require('jszip')
const fs = require('fs')
const path = require('path')

async function testGradientLineXml() {
	const outDir = path.join(__dirname, '../output')
	const pptxPath = path.join(outDir, 'line-gradient-xml-test.pptx')

	fs.mkdirSync(outDir, { recursive: true })

	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_16x9'

	const slide = pptx.addSlide()
	slide.addShape('rect', {
		x: 1,
		y: 1,
		w: 2.5,
		h: 1.2,
		fill: { type: 'none' },
		line: {
			type: 'linearGradient',
			angle: 0,
			stops: [
				{ position: 0, color: 'FF5A5F' },
				{ position: 100, color: '0066FF' },
			],
			width: 3,
			dashType: 'solid',
		},
	})
	slide.addText('No empty line XML', {
		x: 1,
		y: 3,
		w: 2.5,
		h: 0.5,
		fontSize: 16,
		color: '333333',
	})

	await pptx.writeFile({ fileName: pptxPath })

	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')

	const hasGradientLine = /<a:ln[^>]*>[\s\S]*?<a:gradFill[\s\S]*?<\/a:gradFill>[\s\S]*?<\/a:ln>/.test(slideXml)
	const hasZeroAngle = /<a:lin ang="0" scaled="0"\/>/.test(slideXml)
	const hasGradientStops =
		/<a:gs pos="0">[\s\S]*?FF5A5F[\s\S]*?<a:gs pos="100000">[\s\S]*?0066FF/.test(slideXml)
	const hasEmptyLineElement = /<a:ln><\/a:ln>/.test(slideXml)

	console.log('=== Gradient Line XML Tests ===')
	console.log(`Gradient line XML: ${hasGradientLine ? 'PASS' : 'FAIL'}`)
	console.log(`Zero-degree angle XML: ${hasZeroAngle ? 'PASS' : 'FAIL'}`)
	console.log(`Gradient stops XML: ${hasGradientStops ? 'PASS' : 'FAIL'}`)
	console.log(`No empty line XML: ${!hasEmptyLineElement ? 'PASS' : 'FAIL'}`)

	fs.unlinkSync(pptxPath)

	return hasGradientLine && hasZeroAngle && hasGradientStops && !hasEmptyLineElement
}

testGradientLineXml()
	.then(passed => process.exit(passed ? 0 : 1))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})

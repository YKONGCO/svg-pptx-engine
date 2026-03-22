const PptxGenJS = require('../../packages/pptxgenjs/dist/pptxgen.cjs.js')
const fs = require('fs')
const path = require('path')

async function main() {
	const outDir = path.join(__dirname, '../output')
	const outFile = path.join(outDir, 'line-gradient-outline-demo.pptx')

	fs.mkdirSync(outDir, { recursive: true })

	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_16x9'
	pptx.author = 'Codex'
	pptx.subject = 'Gradient line demo'
	pptx.title = 'Gradient Outline Demo'

	const slide = pptx.addSlide()
	slide.background = { color: 'F7F4EF' }

	slide.addText('Gradient Outline Demo', {
		x: 0.5,
		y: 0.3,
		w: 5.5,
		h: 0.4,
		fontSize: 24,
		bold: true,
		color: '2A2A2A',
	})

	slide.addText('`line.type = linearGradient` on shapes and lines', {
		x: 0.5,
		y: 0.7,
		w: 5.5,
		h: 0.3,
		fontSize: 11,
		color: '6A6A6A',
	})

	slide.addShape('rect', {
		x: 0.7,
		y: 1.4,
		w: 2.6,
		h: 1.4,
		fill: { type: 'none' },
		line: {
			type: 'linearGradient',
			angle: 0,
			width: 4,
			stops: [
				{ position: 0, color: 'F94144' },
				{ position: 50, color: 'F8961E' },
				{ position: 100, color: '577590' },
			],
		},
	})
	slide.addText('0° outline', { x: 1.25, y: 1.9, w: 1.5, h: 0.3, fontSize: 12, color: '444444' })

	slide.addShape('roundRect', {
		x: 3.8,
		y: 1.4,
		w: 2.6,
		h: 1.4,
		fill: { color: 'FFF8E7' },
		line: {
			type: 'linearGradient',
			angle: 90,
			width: 5,
			stops: [
				{ position: 0, color: '264653' },
				{ position: 100, color: '2A9D8F' },
			],
		},
	})
	slide.addText('90° outline', { x: 4.35, y: 1.9, w: 1.6, h: 0.3, fontSize: 12, color: '444444' })

	slide.addShape('ellipse', {
		x: 6.95,
		y: 1.35,
		w: 2.0,
		h: 1.5,
		fill: { color: 'FFFFFF', transparency: 15 },
		line: {
			type: 'linearGradient',
			angle: 45,
			width: 6,
			stops: [
				{ position: 0, color: '8E44AD' },
				{ position: 50, color: '3498DB' },
				{ position: 100, color: '2ECC71' },
			],
		},
	})
	slide.addText('45° ellipse', { x: 7.25, y: 1.92, w: 1.5, h: 0.3, fontSize: 12, color: '444444' })

	slide.addShape('line', {
		x: 1.0,
		y: 4.1,
		w: 7.6,
		h: 0,
		line: {
			type: 'linearGradient',
			angle: 0,
			width: 6,
			beginArrowType: 'oval',
			endArrowType: 'triangle',
			stops: [
				{ position: 0, color: 'D62828' },
				{ position: 100, color: '003049' },
			],
		},
	})

	slide.addText('Gradient stroke also works on line shapes, including arrowheads.', {
		x: 1.2,
		y: 4.35,
		w: 6.8,
		h: 0.35,
		fontSize: 12,
		color: '4E4E4E',
	})

	await pptx.writeFile({ fileName: outFile })
	console.log(`Created ${outFile}`)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})

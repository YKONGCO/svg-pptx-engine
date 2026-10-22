#!/usr/bin/env node
// Generate a visual fixture PPTX from an SVG under example/<phase>/.
//
// Usage: node scripts/gen-visual-fixture.js <phase>/<name>
//   e.g. node scripts/gen-visual-fixture.js phase0-2a/batch-a-fixture
//
// Reads example/<phase>/<name>.svg, runs the public svgToPptxFile
// pipeline, writes output/<phase>/<name>.pptx. Exits non-zero on
// conversion failure so the script can plug into a future
// `npm run test:visual` runner.

const path = require('path')
const fs = require('fs')
const { svgToPptxFile } = require('../dist/index')

const relative = process.argv[2]
if (!relative) {
  console.error('usage: node scripts/gen-visual-fixture.js <phase>/<name>')
  process.exit(2)
}

const svgPath = path.join(__dirname, '..', 'example', `${relative}.svg`)
const outPath = path.join(__dirname, '..', 'output', `${relative}.pptx`)

if (!fs.existsSync(svgPath)) {
  console.error(`SVG not found: ${svgPath}`)
  process.exit(2)
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })

const svgString = fs.readFileSync(svgPath, 'utf8')

svgToPptxFile(svgString, outPath, { useLayout: 'auto' })
  .then((written) => {
    const stat = fs.statSync(written)
    console.log(`✓ wrote ${written} (${stat.size} bytes)`)
  })
  .catch((err) => {
    console.error('✗ conversion failed:', err)
    process.exit(1)
  })

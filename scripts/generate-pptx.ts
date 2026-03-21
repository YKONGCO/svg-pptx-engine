// Script to generate PPTX from fixture
import { readFileSync } from 'fs'
import { join } from 'path'
import { PptxGenerator } from '../src/pptx/generator'
import type { SlideDocument } from '../src/sif/types/document'

const fixtureName = process.argv[2] || 'cover-slide'
const outputPath = process.argv[3] || join(__dirname, '..', 'output', `${fixtureName}.pptx`)

// Load fixture
const fixturePath = join(__dirname, '..', 'tests', 'fixtures', `${fixtureName}.json`)
const fixtureContent = readFileSync(fixturePath, 'utf-8')
const document: SlideDocument = JSON.parse(fixtureContent)

// Ensure output directory exists
import { mkdirSync, existsSync } from 'fs'
const outputDir = join(__dirname, '..', 'output')
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true })
}

// Generate PPTX
const generator = new PptxGenerator(document, {
  title: document.meta?.title || fixtureName,
  author: document.meta?.author || 'Test Generator'
})

generator.generate()

// Write file
generator.writeFile({ fileName: outputPath }).then(() => {
  console.log(`Generated: ${outputPath}`)
}).catch(err => {
  console.error('Error generating PPTX:', err)
  process.exit(1)
})

const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')

const projectRoot = path.resolve(__dirname, '..', '..')
const { svgToSif } = require(path.join(projectRoot, 'dist', 'svg', 'converter'))
const { parseSVG, getSvgRoot } = require(path.join(projectRoot, 'dist', 'svg', 'parser'))
const { PptxGenerator } = require(path.join(projectRoot, 'dist', 'pptx', 'generator'))

const svgPath = path.join(projectRoot, 'example', '嵌套SVG测试', 'nested-svg-composition.svg')
const outputDir = path.join(projectRoot, 'tests', 'output')
const pptxPath = path.join(outputDir, 'svg-nested-svg-demo.pptx')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function flattenElements(elements) {
  const flat = []
  for (const element of elements) {
    flat.push(element)
    if (element && element.type === 'group' && Array.isArray(element.children)) {
      flat.push(...flattenElements(element.children))
    }
  }
  return flat
}

async function inspectPptx(filePath) {
  const buffer = fs.readFileSync(filePath)
  const zip = await JSZip.loadAsync(buffer)
  const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
  return { slideXml }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const parsed = parseSVG(svgContent)
  const svgRoot = getSvgRoot(parsed)
  const width = parseFloat(svgRoot?.['@_width']) || 960
  const height = parseFloat(svgRoot?.['@_height']) || 540
  const elements = svgToSif(svgContent, { preserveGroups: true })
  const flatElements = flattenElements(elements)

  const document = {
    version: '1.0.0',
    width,
    height,
    slides: [
      {
        id: 'nested-svg-slide',
        elements
      }
    ],
    meta: {
      title: 'Nested SVG Demo',
      author: 'Codex'
    }
  }

  const generator = new PptxGenerator(document, {
    title: 'Nested SVG Demo',
    author: 'Codex'
  })

  generator.generate()
  await generator.writeFile({ fileName: pptxPath })

  const { slideXml } = await inspectPptx(pptxPath)
  const shapeCount = flatElements.filter(item => item.type === 'shape').length
  const textCount = flatElements.filter(item => item.type === 'text').length

  assert(shapeCount >= 8, 'Nested SVG demo produced too few shapes')
  assert(textCount >= 4, 'Nested SVG demo produced too few text elements')
  assert((slideXml.match(/<p:sp>/g) || []).length >= 8, 'PPTX is missing expected shape/text XML')

  console.log('Nested SVG demo generated successfully.')
  console.log(`SVG:  ${svgPath}`)
  console.log(`PPTX: ${pptxPath}`)
  console.log(`SIF elements: shapes=${shapeCount}, text=${textCount}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

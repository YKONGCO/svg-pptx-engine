const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')

const projectRoot = path.resolve(__dirname, '..', '..')
const { svgToSif } = require(path.join(projectRoot, 'dist', 'svg', 'converter'))
const { parseSVG, getSvgRoot } = require(path.join(projectRoot, 'dist', 'svg', 'parser'))
const { PptxGenerator } = require(path.join(projectRoot, 'dist', 'pptx', 'generator'))

const svgPath = path.join(projectRoot, 'example', '媒体素材测试', 'public-media-assets.svg')
const outputDir = path.join(projectRoot, 'tests', 'output')
const pptxPath = path.join(outputDir, 'svg-media-assets-demo.pptx')

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
  const slideRelsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'))

  return {
    slideXml,
    slideRelsXml,
    mediaFiles
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })

  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const parsed = parseSVG(svgContent)
  const svgRoot = getSvgRoot(parsed)
  const width = parseFloat(svgRoot?.['@_width']) || 1280
  const height = parseFloat(svgRoot?.['@_height']) || 720
  const elements = svgToSif(svgContent, { preserveGroups: true })

  const document = {
    version: '1.0.0',
    width,
    height,
    slides: [
      {
        id: 'media-slide',
        elements
      }
    ],
    meta: {
      title: 'SVG Media Assets Demo',
      author: 'Codex'
    }
  }

  const generator = new PptxGenerator(document, {
    title: 'SVG Media Assets Demo',
    author: 'Codex'
  })

  generator.generate()
  await generator.writeFile({ fileName: pptxPath })

  const { slideXml, slideRelsXml, mediaFiles } = await inspectPptx(pptxPath)
  const flatElements = flattenElements(elements)

  assert(flatElements.some(item => item.type === 'image'), 'SIF is missing image element')
  assert(flatElements.some(item => item.type === 'video'), 'SIF is missing video element')
  assert(flatElements.some(item => item.type === 'audio'), 'SIF is missing audio element')
  assert((slideXml.match(/<p:pic>/g) || []).length >= 1, 'PPTX is missing image shape XML')
  assert((slideXml.match(/<a:videoFile /g) || []).length >= 1, 'PPTX is missing video XML')
  assert((slideRelsXml.match(/relationships\/audio/g) || []).length >= 1 || (slideRelsXml.match(/relationships\/media/g) || []).length >= 1, 'PPTX is missing audio relationships')
  assert(mediaFiles.length >= 3, 'PPTX media folder does not contain expected assets')

  console.log('SVG media demo generated successfully.')
  console.log(`SVG:   ${svgPath}`)
  console.log(`PPTX:  ${pptxPath}`)
  console.log(`Media: ${mediaFiles.join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

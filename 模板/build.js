#!/usr/bin/env node
// 模板批量构建脚本
// 用法:
//   node 模板/build.js                       # 全部转, 输出到 模板/dist/
//   node 模板/build.js 01-学术蓝白           # 转单个目录
//   node 模板/build.js 01-学术蓝白 04-section # 转单个文件
//
// 输出 PPTX 每页 = 一个 SVG。

const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const DIST = path.join(ROOT, 'dist')

function loadEngine() {
  const distEntry = path.join(ROOT, '..', 'dist', 'index.js')
  if (!fs.existsSync(distEntry)) {
    throw new Error('未找到 dist/index.js, 请先 npm run build')
  }
  return require(distEntry)
}

function listSvgs(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) return [target]
  if (!stat.isDirectory()) return []
  return fs
    .readdirSync(target)
    .filter(f => f.toLowerCase().endsWith('.svg'))
    .sort()
    .map(f => path.join(target, f))
}

function outputPathFor(svgFile, outDir) {
  const base = path.basename(svgFile, '.svg')
  return path.join(outDir, base + '.pptx')
}

async function buildOne(engine, svgFile, outDir, title) {
  const html = fs.readFileSync(svgFile, 'utf8')
  // 用 svg2pptx 单页 API(每 SVG → 1 slide)
  const { svgToPptxFile } = engine
  const out = outputPathFor(svgFile, outDir)
  await svgToPptxFile(html, out, { title: title || path.basename(svgFile, '.svg') })
  return out
}

async function main() {
  const arg = process.argv[2]
  const engine = loadEngine()

  // 顶层统一用目录列表驱动:
  // - 无参数: ROOT 下所有 NN-* 子目录
  // - 参数指向子目录: 仅该子目录
  // - 参数指向单个 .svg 文件: 仅该文件
  let subdirs = []
  let singleFile = null

  if (!arg) {
    subdirs = fs
      .readdirSync(ROOT)
      .filter(d => /^\d+-/.test(d))
      .map(d => path.join(ROOT, d))
      .filter(p => {
        try {
          return fs.statSync(p).isDirectory()
        } catch {
          return false
        }
      })
  } else {
    const t = path.isAbsolute(arg) ? arg : path.join(ROOT, arg)
    const stat = fs.statSync(t)
    if (stat.isDirectory()) {
      subdirs = [t]
    } else if (stat.isFile() && t.toLowerCase().endsWith('.svg')) {
      singleFile = t
    } else {
      console.error('未找到 SVG 文件或子目录:', arg)
      process.exit(1)
    }
  }

  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })

  const results = []
  if (singleFile) {
    const out = await buildOne(engine, singleFile, DIST)
    results.push(out)
  } else {
    for (const sub of subdirs) {
      const outDir = path.join(DIST, path.basename(sub))
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
      const svgs = listSvgs(sub)
      for (const svg of svgs) {
        const out = await buildOne(engine, svg, outDir)
        results.push(out)
      }
    }
  }

  console.log(`生成 ${results.length} 个 PPTX:`)
  for (const r of results) console.log('  ' + path.relative(ROOT, r))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
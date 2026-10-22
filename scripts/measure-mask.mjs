import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const png = PNG.sync.read(readFileSync('output/06-clip-and-mask/02-mask-alpha.png'))
const { width, height, data } = png
const scale = width / 1180
// Panel 5 green rect: SVG (40, 310) to (560, 410)
const yMid = Math.floor(360 * scale)
// Sample at 10 positions across the rect
for (let i = 0; i <= 9; i++) {
  const xSvg = 40 + (520 * i / 9)
  const xImg = Math.floor(xSvg * scale)
  const py = yMid
  const idx = (py * width + xImg) * 4
  const r = data[idx], g = data[idx+1], b = data[idx+2]
  // alpha = 1 - (g - 113) / (255 - 113)  over white
  const alpha = 1 - (g - 113) / (255 - 113)
  console.log(`  x=${xSvg.toFixed(0)} rgb=(${r},${g},${b}) alpha=${alpha.toFixed(2)}`)
}

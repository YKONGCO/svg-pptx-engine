import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const png = PNG.sync.read(readFileSync('output/06-clip-and-mask/02-mask-alpha.png'))
const { width, height, data } = png
const scale = width / 1180
// Panel 5 green rect: SVG (40, 310) to (560, 410)
// Card is at (20, 270) to (580, 440), with text at y=270, rect at y=270+40=310
// Sample at 5 x positions, multiple y positions
const xs = [60, 180, 300, 420, 540]
const ys = [320, 340, 360, 380, 400]
console.log('Sampling (x,y) alpha:')
for (const ySvg of ys) {
  const yImg = Math.floor(ySvg * scale)
  for (const xSvg of xs) {
    const xImg = Math.floor(xSvg * scale)
    const idx = (yImg * width + xImg) * 4
    const r = data[idx], g = data[idx+1], b = data[idx+2]
    const alpha = 1 - (g - 113) / (255 - 113)
    process.stdout.write(`(${xSvg},${ySvg}) a=${alpha.toFixed(2)}  `)
  }
  console.log()
}

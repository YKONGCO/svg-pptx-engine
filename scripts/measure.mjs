import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const png = PNG.sync.read(readFileSync('output/06-clip-and-mask/01-clip-rect.png'))
const { width, height, data } = png
const scale = width / 1180
console.log('Image size:', width, 'x', height, 'scale:', scale)
// Panel 1 card is at SVG (20, 20)-(300, 220). Scan only y in image scale of [40, 330]
const yMin = Math.floor(40), yMax = Math.floor(330)
const xMin = Math.floor(20 * scale), xMax = Math.floor(310 * scale)
let minX = width, maxX = 0, minY = height, maxY = 0
let count = 0
for (let y = yMin; y < yMax; y++) {
  for (let x = xMin; x < xMax; x++) {
    const i = (y * width + x) * 4
    const r = data[i], g = data[i+1], b = data[i+2]
    if (Math.abs(r-107) < 15 && Math.abs(g-91) < 15 && Math.abs(b-149) < 15) {
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
}
console.log('Panel 1 purple count:', count)
console.log('Panel 1 bbox: x=[%d, %d] y=[%d, %d]', minX, maxX, minY, maxY)
console.log('SVG-equivalent width:', (maxX - minX + 1) / scale)

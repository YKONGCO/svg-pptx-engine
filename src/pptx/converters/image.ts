// Image Converter - Converts SIF image elements to pptxgenjs images

import PptxGenJS from 'pptxgenjs'
import type { ImageElement } from '../../sif/types/elements/image'
import { imageHrefToPptx, pxToInch, opacityToTransparency } from '../utils'

/**
 * Convert image element to pptxgenjs image props
 */
export function convertImage(image: ImageElement, hyperlink?: PptxGenJS.HyperlinkProps): PptxGenJS.ImageProps {
  const { data, path } = imageHrefToPptx(image.href)
  const translateX = image.transform?.translateX ?? 0
  const translateY = image.transform?.translateY ?? 0
  const scaleX = image.transform?.scaleX ?? 1
  const scaleY = image.transform?.scaleY ?? 1

  const imageProps: PptxGenJS.ImageProps = {
    x: pxToInch(image.x + translateX),
    y: pxToInch(image.y + translateY),
    w: pxToInch(image.width * scaleX),
    h: pxToInch(image.height * scaleY),
    ...(data ? { data } : { path: path || image.href }),
    flipH: image.flipH,
    flipV: image.flipV
  }

  if (hyperlink) {
    imageProps.hyperlink = hyperlink
  }

  // Handle rotation
  if (image.transform?.rotate !== undefined) {
    imageProps.rotate = image.transform.rotate
  }

  // Handle transparency/opacity
  if (image.opacity !== undefined && image.opacity < 1) {
    imageProps.transparency = opacityToTransparency(image.opacity)
  }

  // Handle sizing
  if (image.preserveAspectRatio !== undefined) {
    const fit: 'contain' | 'cover' = image.preserveAspectRatio ? 'contain' : 'cover'
    imageProps.sizing = {
      type: fit,
      w: pxToInch(image.width),
      h: pxToInch(image.height)
    }
  }

  // Handle crop
  if (image.crop) {
    const crop = image.crop
    const visibleWidth = Math.max(0.0001, 1 - (crop.left ?? 0) - (crop.right ?? 0))
    const visibleHeight = Math.max(0.0001, 1 - (crop.top ?? 0) - (crop.bottom ?? 0))
    const cropWidth = (image.width * scaleX) / visibleWidth
    const cropHeight = (image.height * scaleY) / visibleHeight
    imageProps.sizing = {
      type: 'crop',
      w: pxToInch(cropWidth),
      h: pxToInch(cropHeight),
      x: crop.left !== undefined ? pxToInch(crop.left * cropWidth) : undefined,
      y: crop.top !== undefined ? pxToInch(crop.top * cropHeight) : undefined
    }
  }

  // Handle filter effect (grayscale, sepia, blur)
  // Note: pptxgenjs may not natively support all image filters
  if (image.filter && image.filter !== 'none') {
    (imageProps as any).filter = image.filter
  }

  return imageProps
}

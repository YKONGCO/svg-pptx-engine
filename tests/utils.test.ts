// Tests for PPTX utility functions

import {
  pxToInch,
  hexToPptxColor,
  hexToPptxColorWithAlpha,
  opacityToTransparency,
  dashArrayToDashType,
  fontWeightToBool,
  fontStyleToBool,
  textAlignToPptx,
  verticalAlignToPptx,
  pxToPt,
  imageHrefToPptx,
  imageFitToSizing
} from '../src/pptx/utils'

describe('PPTX Utility Functions', () => {
  describe('pxToInch', () => {
    it('should convert pixels to inches correctly', () => {
      expect(pxToInch(96)).toBe(1)
      expect(pxToInch(1920)).toBe(20)
      expect(pxToInch(1080)).toBe(11.25)
      expect(pxToInch(0)).toBe(0)
    })

    it('should handle decimal pixels', () => {
      expect(pxToInch(50)).toBeCloseTo(0.5208, 3)
    })
  })

  describe('pxToPt', () => {
    it('should convert pixels to points correctly', () => {
      expect(pxToPt(12)).toBe(9)
      expect(pxToPt(24)).toBe(18)
      expect(pxToPt(0)).toBe(0)
    })
  })

  describe('hexToPptxColor', () => {
    it('should convert 6-digit hex to PPTX color format', () => {
      expect(hexToPptxColor('FF0000')).toBe('FF0000')
      expect(hexToPptxColor('00FF00')).toBe('00FF00')
      expect(hexToPptxColor('0000FF')).toBe('0000FF')
    })

    it('should handle 3-digit hex', () => {
      expect(hexToPptxColor('F00')).toBe('FF0000')
    })

    it('should handle 8-digit hex with alpha', () => {
      expect(hexToPptxColor('FF000080')).toBe('FF0000')
    })
  })

  describe('hexToPptxColorWithAlpha', () => {
    it('should convert 8-digit hex with alpha', () => {
      const result = hexToPptxColorWithAlpha('FF000080')
      expect(result.color).toBe('FF0000')
      expect(result.transparency).toBe(50)
    })

    it('should handle 6-digit hex without alpha', () => {
      const result = hexToPptxColorWithAlpha('FF0000')
      expect(result.color).toBe('FF0000')
      expect(result.transparency).toBeUndefined()
    })
  })

  describe('opacityToTransparency', () => {
    it('should convert opacity to transparency', () => {
      expect(opacityToTransparency(1)).toBe(0)
      expect(opacityToTransparency(0.5)).toBe(50)
      expect(opacityToTransparency(0)).toBe(100)
    })
  })

  describe('dashArrayToDashType', () => {
    it('should convert dash arrays to PPTX dash types', () => {
      expect(dashArrayToDashType('5,5')).toBe('dash')
    })
  })

  describe('fontWeightToBool', () => {
    it('should convert font weight to boolean', () => {
      expect(fontWeightToBool('bold')).toBe(true)
      expect(fontWeightToBool('normal')).toBe(false)
    })
  })

  describe('fontStyleToBool', () => {
    it('should convert font style to boolean', () => {
      expect(fontStyleToBool('italic')).toBe(true)
      expect(fontStyleToBool('normal')).toBe(false)
    })
  })

  describe('textAlignToPptx', () => {
    it('should convert text align to PPTX format', () => {
      expect(textAlignToPptx('left')).toBe('left')
      expect(textAlignToPptx('center')).toBe('center')
      expect(textAlignToPptx('right')).toBe('right')
    })
  })

  describe('verticalAlignToPptx', () => {
    it('should convert vertical align to PPTX format', () => {
      expect(verticalAlignToPptx('top')).toBe('top')
      expect(verticalAlignToPptx('middle')).toBe('middle')
      expect(verticalAlignToPptx('bottom')).toBe('bottom')
    })
  })

  describe('imageHrefToPptx', () => {
    it('should handle HTTP URLs', () => {
      const result = imageHrefToPptx('https://example.com/image.png')
      expect(result.path).toBe('https://example.com/image.png')
    })

    it('should handle data URIs', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgo=='
      const result = imageHrefToPptx(dataUri)
      expect(result.data).toBe(dataUri)
    })
  })

  describe('imageFitToSizing', () => {
    it('should convert image fit to sizing', () => {
      expect(imageFitToSizing('contain')).toBeDefined()
      expect(imageFitToSizing('cover')).toBeDefined()
    })
  })
})

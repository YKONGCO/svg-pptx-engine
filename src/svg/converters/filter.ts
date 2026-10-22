import type { VisualEffect, ShadowEffect, GlowEffect, BlurEffect, ColorMatrixEffect } from '../../sif/types/style/effect'
import type { Fill } from '../../sif/types/style/fill'
import type { Stroke } from '../../sif/types/style/stroke'
import { parseColor, parseOpacity } from './color'

export interface FilterTemplate {
  kind: 'shadow' | 'glow' | 'blur' | 'colorMatrix'
  blur: number
  offsetX?: number
  offsetY?: number
  opacity?: number
  /** feDropShadow colour (defaults to #000000). */
  shadowColor?: string
  /** 4×5 colour matrix for `feColorMatrix` (row-major, 20 numbers). */
  colorMatrix?: number[]
  /** feColorMatrix `type` (matrix | saturate | hueRotate | luminanceToAlpha). */
  colorMatrixType?: 'matrix' | 'saturate' | 'hueRotate' | 'luminanceToAlpha'
  /** For `saturate` / `hueRotate`: the single scalar/value. */
  colorMatrixValue?: number
}

export function convertFilterDef(filter: Record<string, unknown>): FilterTemplate | undefined {
  // feDropShadow is the modern, self-contained drop shadow primitive.
  // It carries its own `flood-color` / `flood-opacity` so we don't have
  // to infer the shadow colour from the element being filtered.
  const dropShadow = getFirstChild(filter, 'feDropShadow')
  if (dropShadow) {
    const floodColor = parseColor(getAttr(dropShadow, 'flood-color') || '#000000')
    const floodOpacity = parseOpacity(getAttr(dropShadow, 'flood-opacity'))
    return {
      kind: 'shadow',
      blur: parseNumberAttr(dropShadow, 'stdDeviation', 0),
      offsetX: parseNumberAttr(dropShadow, 'dx', 0),
      offsetY: parseNumberAttr(dropShadow, 'dy', 0),
      opacity: floodOpacity,
      shadowColor: floodColor
    }
  }

  // feOffset + feGaussianBlur + (optional) feFlood = explicit drop shadow
  // chain. Same shape as the `feDropShadow` template, but the colour
  // comes from a sibling `feFlood` rather than from the element's fill.
  const offsetNode = getFirstChild(filter, 'feOffset')
  const blurNode = getFirstChild(filter, 'feGaussianBlur')
  const componentTransfer = getFirstChild(filter, 'feComponentTransfer')
  const funcA = componentTransfer ? getFirstChild(componentTransfer, 'feFuncA') : undefined
  const floodNode = getFirstChild(filter, 'feFlood')
  const stdDeviation = parseNumberAttr(blurNode, 'stdDeviation', 0)
  const opacity = parseOpacity(getAttr(funcA, 'slope'))

  if (offsetNode) {
    const floodColor = floodNode
      ? parseColor(getAttr(floodNode, 'flood-color') || '#000000')
      : undefined
    const floodOpacity = floodNode
      ? parseOpacity(getAttr(floodNode, 'flood-opacity'))
      : undefined
    // Phase 5.1: a `<filter>` that contains BOTH an offset/blur
    // shadow chain AND an `feColorMatrix` (e.g. the shadowHue
    // fixture) usually applies the color matrix to the *whole*
    // post-merge result, not just the source. PPTX can't reproduce
    // that on a single shape, but the existing solid-fill fallback
    // in `convertShape` (desaturate / hue-rotate the fill colour)
    // gives a closer result if we forward the matrix fields here
    // instead of dropping them. The shadow itself still renders
    // with the inferred colour, which is a reasonable compromise.
    const colorMatrixNode = getFirstChild(filter, 'feColorMatrix')
    const matrix = colorMatrixNode ? convertColorMatrix(colorMatrixNode) : undefined
    return {
      kind: 'shadow',
      blur: stdDeviation,
      offsetX: parseNumberAttr(offsetNode, 'dx', 0),
      offsetY: parseNumberAttr(offsetNode, 'dy', 0),
      opacity: floodOpacity ?? opacity,
      shadowColor: floodColor,
      colorMatrixType: matrix?.colorMatrixType,
      colorMatrixValue: matrix?.colorMatrixValue,
      colorMatrix: matrix?.colorMatrix
    }
  }

  // feColorMatrix (commonly used for grayscale, sepia, hue shifts).
  // Detected before the blur-only branch so it wins when present.
  const colorMatrixNode = getFirstChild(filter, 'feColorMatrix')
  if (colorMatrixNode) {
    return convertColorMatrix(colorMatrixNode)
  }

  if (blurNode) {
    const merge = getFirstChild(filter, 'feMerge')
    const mergeNodes = getChildren(merge, 'feMergeNode')
    const referencesGraphic = mergeNodes.some(node => (getAttr(node, 'in') || '').toLowerCase() === 'sourcegraphic')

    // Glow filters that chain a teal-tinted `feFlood` (e.g. the
    // overlayGlow fixture: blur → feFlood → feComposite → feMerge)
    // lose the colour if we don't lift it out of the filter. Without
    // this, the renderer falls back to the host fill and produces a
    // white halo on a white card — invisible against the panel.
    const floodColor = floodNode
      ? parseColor(getAttr(floodNode, 'flood-color') || '#000000')
      : undefined
    const floodOpacity = floodNode
      ? parseOpacity(getAttr(floodNode, 'flood-opacity'))
      : undefined

    return {
      kind: referencesGraphic ? 'glow' : 'blur',
      blur: stdDeviation,
      opacity: floodOpacity ?? opacity,
      shadowColor: floodColor
    }
  }

  return undefined
}

function convertColorMatrix(node: Record<string, unknown>): FilterTemplate {
  // SVG attribute `type` is case-insensitive; normalise to the
  // canonical camelCase form used in the FilterTemplate type.
  const rawType = (getAttr(node, 'type') || 'matrix').toLowerCase()
  let typeAttr: NonNullable<FilterTemplate['colorMatrixType']> = 'matrix'
  if (rawType === 'saturate') typeAttr = 'saturate'
  else if (rawType === 'huerotate') typeAttr = 'hueRotate'
  else if (rawType === 'luminancetoalpha') typeAttr = 'luminanceToAlpha'

  const valuesAttr = getAttr(node, 'values')
  const values = valuesAttr
    ? valuesAttr.trim().split(/[\s,]+/).map(part => parseFloat(part)).filter(n => !Number.isNaN(n))
    : []

  if (typeAttr === 'saturate') {
    return {
      kind: 'colorMatrix',
      blur: 0,
      colorMatrixType: 'saturate',
      colorMatrixValue: values[0] ?? 1
    }
  }
  if (typeAttr === 'hueRotate') {
    return {
      kind: 'colorMatrix',
      blur: 0,
      colorMatrixType: 'hueRotate',
      colorMatrixValue: values[0] ?? 0
    }
  }
  if (typeAttr === 'luminanceToAlpha') {
    return {
      kind: 'colorMatrix',
      blur: 0,
      colorMatrixType: 'luminanceToAlpha'
    }
  }

  // Default `type="matrix"`: expect 20 numbers, fill with identity if missing.
  const matrix: number[] = values.length >= 20 ? values.slice(0, 20) : IDENTITY_COLOR_MATRIX.slice()
  return {
    kind: 'colorMatrix',
    blur: 0,
    colorMatrixType: 'matrix',
    colorMatrix: matrix
  }
}

/** Identity 4×5 color matrix (row-major: R G B A 1 per row). */
const IDENTITY_COLOR_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0
]

export function resolveFilterEffect(
  template: FilterTemplate | undefined,
  source: { fill?: Fill; stroke?: Stroke }
): VisualEffect | undefined {
  if (!template) return undefined

  switch (template.kind) {
    case 'shadow': {
      // `template.shadowColor` is set when the SVG filter contains
      // an explicit `feFlood` (e.g. `<feFlood flood-color="teal">`).
      // When it isn't set the natural SVG result is a black
      // silhouette blur — `feGaussianBlur` against `SourceAlpha`
      // produces a black/white mask, not the host's fill colour.
      // Falling back to the host fill (the previous behaviour) made
      // soft shadows on white cards invisible.
      const color = template.shadowColor || '#000000'
      const applyColorMatrixToFill =
        template.colorMatrixType
          ? {
              matrixType: template.colorMatrixType,
              values: template.colorMatrix,
              value: template.colorMatrixValue
            }
          : undefined
      const effect: ShadowEffect = {
        type: 'shadow',
        color,
        offsetX: template.offsetX || 0,
        offsetY: template.offsetY || 0,
        blur: template.blur,
        opacity: template.opacity,
        applyColorMatrixToFill
      }
      return effect
    }
    case 'glow': {
      const color = template.shadowColor || resolveEffectColor(source) || '#000000'
      const effect: GlowEffect = {
        type: 'glow',
        color,
        radius: template.blur,
        opacity: template.opacity
      }
      return effect
    }
    case 'blur': {
      const effect: BlurEffect = {
        type: 'blur',
        radius: template.blur
      }
      return effect
    }
    case 'colorMatrix': {
      const effect: ColorMatrixEffect = {
        type: 'colorMatrix',
        matrixType: template.colorMatrixType || 'matrix',
        values: template.colorMatrix,
        value: template.colorMatrixValue
      }
      return effect
    }
    default:
      return undefined
  }
}

function resolveEffectColor(source: { fill?: Fill; stroke?: Stroke }): string | undefined {
  if (source.stroke?.color && source.stroke.color !== 'transparent') {
    return parseColor(source.stroke.color)
  }

  if (source.fill?.type === 'solid' && source.fill.color !== 'transparent') {
    return parseColor(source.fill.color)
  }

  return undefined
}

function getFirstChild(element: Record<string, unknown> | undefined, name: string): Record<string, unknown> | undefined {
  if (!element || !(name in element)) return undefined
  const value = element[name]
  if (Array.isArray(value)) {
    return value.find(item => item && typeof item === 'object') as Record<string, unknown> | undefined
  }
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>
  }
  return undefined
}

function getChildren(element: Record<string, unknown> | undefined, name: string): Record<string, unknown>[] {
  if (!element || !(name in element)) return []
  const value = element[name]
  if (Array.isArray(value)) {
    return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
  }
  if (value && typeof value === 'object') {
    return [value as Record<string, unknown>]
  }
  return []
}

function getAttr(element: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!element) return undefined
  const attrKey = `@_${name}`
  if (attrKey in element) {
    return String(element[attrKey])
  }
  return undefined
}

function parseNumberAttr(element: Record<string, unknown> | undefined, name: string, fallback: number): number {
  const value = getAttr(element, name)
  if (!value) return fallback
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? fallback : parsed
}

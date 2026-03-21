import type { VisualEffect, ShadowEffect, GlowEffect, BlurEffect } from '../../sif/types/style/effect'
import type { Fill } from '../../sif/types/style/fill'
import type { Stroke } from '../../sif/types/style/stroke'
import { parseColor, parseOpacity } from './color'

export interface FilterTemplate {
  kind: 'shadow' | 'glow' | 'blur'
  blur: number
  offsetX?: number
  offsetY?: number
  opacity?: number
}

export function convertFilterDef(filter: Record<string, unknown>): FilterTemplate | undefined {
  const blurNode = getFirstChild(filter, 'feGaussianBlur')
  const offsetNode = getFirstChild(filter, 'feOffset')
  const componentTransfer = getFirstChild(filter, 'feComponentTransfer')
  const funcA = componentTransfer ? getFirstChild(componentTransfer, 'feFuncA') : undefined
  const stdDeviation = parseNumberAttr(blurNode, 'stdDeviation', 0)
  const opacity = parseOpacity(getAttr(funcA, 'slope'))

  if (offsetNode) {
    return {
      kind: 'shadow',
      blur: stdDeviation,
      offsetX: parseNumberAttr(offsetNode, 'dx', 0),
      offsetY: parseNumberAttr(offsetNode, 'dy', 0),
      opacity
    }
  }

  if (blurNode) {
    const merge = getFirstChild(filter, 'feMerge')
    const mergeNodes = getChildren(merge, 'feMergeNode')
    const referencesGraphic = mergeNodes.some(node => (getAttr(node, 'in') || '').toLowerCase() === 'sourcegraphic')

    return {
      kind: referencesGraphic ? 'glow' : 'blur',
      blur: stdDeviation,
      opacity
    }
  }

  return undefined
}

export function resolveFilterEffect(
  template: FilterTemplate | undefined,
  source: { fill?: Fill; stroke?: Stroke }
): VisualEffect | undefined {
  if (!template) return undefined

  switch (template.kind) {
    case 'shadow': {
      const color = resolveEffectColor(source) || '#000000'
      const effect: ShadowEffect = {
        type: 'shadow',
        color,
        offsetX: template.offsetX || 0,
        offsetY: template.offsetY || 0,
        blur: template.blur,
        opacity: template.opacity
      }
      return effect
    }
    case 'glow': {
      const color = resolveEffectColor(source) || '#000000'
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

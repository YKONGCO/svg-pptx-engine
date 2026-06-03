// SVG Parser - Parses SVG strings into objects
import { XMLParser } from 'fast-xml-parser'

export interface SVGParseOptions {
  ignoreAttributes?: boolean
  ignoreDeclaration?: boolean
  parseAttributeValue?: boolean
}

const defaultOptions: SVGParseOptions = {
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseAttributeValue: true
}

const ORDERED_CHILDREN = '__orderedChildren'

/**
 * Parse an SVG string into a JavaScript object
 */
export function parseSVG(svgString: string, options?: SVGParseOptions): Record<string, unknown> {
  const parserOptions = { ...defaultOptions, ...options }
  const parser = new XMLParser(parserOptions)
  const result = parser.parse(svgString)

  const orderedParser = new XMLParser({ ...parserOptions, preserveOrder: true })
  const orderedResult = orderedParser.parse(svgString)
  annotateParsedTreeWithOrder(result, orderedResult)

  return result
}

/**
 * Get the root svg element from parsed result
 */
export function getSvgRoot(parsed: Record<string, unknown>): Record<string, unknown> | undefined {
  if ('svg' in parsed) {
    return parsed.svg as Record<string, unknown>
  }
  return undefined
}

/**
 * Get all defs elements as a map of id -> element
 */
export function getDefs(svgRoot: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const defsMap = new Map<string, Record<string, unknown>>()

  if ('defs' in svgRoot) {
    const defs = svgRoot.defs
    if (Array.isArray(defs)) {
      for (const def of defs) {
        extractDefIds(def as Record<string, unknown>, defsMap)
      }
    } else if (typeof defs === 'object') {
      extractDefIds(defs as Record<string, unknown>, defsMap)
    }
  }

  return defsMap
}

function extractDefIds(def: Record<string, unknown>, defsMap: Map<string, Record<string, unknown>>): void {
  if (!def || typeof def !== 'object') return

  // Recurse into children
  for (const key of Object.keys(def)) {
    const value = def[key]
    if (key.startsWith('@_')) continue // Skip attributes
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object') {
          extractDefIds(item as Record<string, unknown>, defsMap)
        }
      }
    } else if (typeof value === 'object') {
      const child = value as Record<string, unknown>
      if ('@_id' in child) {
        defsMap.set(String(child['@_id']), child)
      }
      extractDefIds(child, defsMap)
    }
  }

  if ('@_id' in def) {
    const id = def['@_id'] as string
    defsMap.set(id, def)
  }
}

/**
 * Get child elements of an SVG element (non-defs)
 */
export function getChildElements(element: Record<string, unknown>): Record<string, unknown>[] {
  const orderedChildren = getOrderedChildren(element)
  if (orderedChildren) {
    return orderedChildren
  }

  const children: Record<string, unknown>[] = []
  const elementTypes = [
    'rect', 'circle', 'ellipse', 'path', 'line',
    'polygon', 'polyline', 'text', 'g', 'svg',
    // Phase 1: defs references and animation snapshots
    'use', 'symbol', 'textPath', 'switch',
    'set', 'animate', 'animateTransform', 'animateMotion'
  ]

  for (const key of Object.keys(element)) {
    if (key === 'defs') continue
    if (key.startsWith('@_')) continue // Attributes
    if (key === '#text') continue

    const value = element[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          if (elementTypes.includes(key)) {
            const elementObj: Record<string, unknown> = {}
            elementObj[key] = item
            children.push(elementObj)
          } else {
            children.push(item as Record<string, unknown>)
          }
        }
      }
    } else if (value && typeof value === 'object') {
      if (elementTypes.includes(key)) {
        // Key is an element type - the element is { key: value }
        // Always wrap to preserve the element wrapper
        const elementObj: Record<string, unknown> = {}
        elementObj[key] = value
        children.push(elementObj)
      } else {
        // Key is not an element type - value is just data
        children.push(value as Record<string, unknown>)
      }
    }
  }

  return children
}

export function copyElementMetadata(source: Record<string, unknown>, target: Record<string, unknown>): void {
  const orderedChildren = getOrderedChildren(source)
  if (!orderedChildren) {
    return
  }

  Object.defineProperty(target, ORDERED_CHILDREN, {
    value: orderedChildren,
    enumerable: false,
    configurable: true
  })
}

function annotateParsedTreeWithOrder(
  parsed: Record<string, unknown>,
  ordered: unknown
): void {
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(ordered)) {
    return
  }

  const orderedRoot = ordered.find(
    item => item && typeof item === 'object' && 'svg' in (item as Record<string, unknown>)
  ) as Record<string, unknown> | undefined

  if (!orderedRoot || !('svg' in parsed) || typeof parsed.svg !== 'object' || !Array.isArray(orderedRoot.svg)) {
    return
  }

  annotateNode(parsed.svg as Record<string, unknown>, orderedRoot.svg)
}

function annotateNode(
  node: Record<string, unknown>,
  orderedChildren: unknown[]
): void {
  const wrappedChildren: Record<string, unknown>[] = []
  const usageCount = new Map<string, number>()

  for (const entry of orderedChildren) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue

    const tagName = Object.keys(entry as Record<string, unknown>).find(key => key !== ':@')
    if (!tagName || tagName === '#text' || tagName === '#cdata-section') continue

    const child = takeMatchedChild(node, tagName, usageCount)
    if (!child) continue

    wrappedChildren.push({ [tagName]: child })

    const orderedGrandChildren = (entry as Record<string, unknown>)[tagName]
    if (Array.isArray(orderedGrandChildren)) {
      annotateNode(child, orderedGrandChildren)
    }
  }

  if (wrappedChildren.length > 0) {
    Object.defineProperty(node, ORDERED_CHILDREN, {
      value: wrappedChildren,
      enumerable: false,
      configurable: true
    })
  }
}

function takeMatchedChild(
  node: Record<string, unknown>,
  tagName: string,
  usageCount: Map<string, number>
): Record<string, unknown> | undefined {
  const source = node[tagName]
  if (!source || typeof source !== 'object') {
    return undefined
  }

  const currentIndex = usageCount.get(tagName) ?? 0
  usageCount.set(tagName, currentIndex + 1)

  if (Array.isArray(source)) {
    const item = source[currentIndex]
    return item && typeof item === 'object' ? item as Record<string, unknown> : undefined
  }

  return currentIndex === 0 ? source as Record<string, unknown> : undefined
}

function getOrderedChildren(element: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const orderedChildren = (element as Record<string, unknown> & { [ORDERED_CHILDREN]?: Record<string, unknown>[] })[ORDERED_CHILDREN]
  return Array.isArray(orderedChildren) ? orderedChildren : undefined
}

/**
 * Get attribute value from element
 */
export function getAttr(element: Record<string, unknown>, name: string): string | undefined {
  const attrKey = `@_${name}`
  if (attrKey in element) {
    return String(element[attrKey])
  }
  return undefined
}

/**
 * Get all attributes as an object
 */
export function getAttrs(element: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const key of Object.keys(element)) {
    if (key.startsWith('@_')) {
      attrs[key.slice(2)] = String(element[key])
    }
  }
  return attrs
}

/**
 * Get element tag name
 */
export function getTagName(element: Record<string, unknown>): string {
  return getAttr(element, 'id') ? 'id' : '#unknown'
}

// Helper to extract text content
export function getTextContent(element: Record<string, unknown>): string {
  if ('#text' in element) {
    return String(element['#text'])
  }
  if ('#cdata-section' in element) {
    return String(element['#cdata-section'])
  }
  return ''
}

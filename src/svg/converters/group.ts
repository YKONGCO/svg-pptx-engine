// Group/transform utilities for SVG -> SIF conversion
import type { GroupElement, Element } from '../../sif/types/elements'
import { getAttr } from '../parser'

export interface Transform {
  translateX: number
  translateY: number
  rotate?: number
  scaleX?: number
  scaleY?: number
  matrix?: [number, number, number, number, number, number]
}

export type TransformMatrix = [number, number, number, number, number, number]

const IDENTITY_MATRIX: TransformMatrix = [1, 0, 0, 1, 0, 0]

export function identityMatrix(): TransformMatrix {
  return [...IDENTITY_MATRIX]
}

export function parseTransform(transform: string | undefined): Transform | undefined {
  if (!transform?.trim()) return undefined

  const result: Transform = {
    translateX: 0,
    translateY: 0
  }

  const regex = /([a-zA-Z]+)\s*\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(transform)) !== null) {
    const command = match[1]
    const values = parseTransformNumbers(match[2])

    switch (command) {
      case 'translate':
        result.translateX += values[0] || 0
        result.translateY += values[1] || 0
        break
      case 'scale':
        result.scaleX = (result.scaleX ?? 1) * (values[0] || 1)
        result.scaleY = (result.scaleY ?? 1) * (values[1] ?? values[0] ?? 1)
        break
      case 'rotate':
        result.rotate = (result.rotate || 0) + (values[0] || 0)
        break
      case 'matrix':
        if (values.length >= 6) {
          result.matrix = [
            values[0],
            values[1],
            values[2],
            values[3],
            values[4],
            values[5]
          ]
        }
        break
    }
  }

  if (
    result.translateX === 0 &&
    result.translateY === 0 &&
    result.rotate === undefined &&
    result.scaleX === undefined &&
    result.scaleY === undefined &&
    result.matrix === undefined
  ) {
    return undefined
  }

  return result
}

export function parseTransformToMatrix(transform: string | undefined): TransformMatrix {
  if (!transform?.trim()) return identityMatrix()

  let current = identityMatrix()
  const regex = /([a-zA-Z]+)\s*\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(transform)) !== null) {
    const command = match[1]
    const values = parseTransformNumbers(match[2])
    current = multiplyMatrices(current, commandToMatrix(command, values))
  }

  return current
}

export function multiplyMatrices(a: TransformMatrix, b: TransformMatrix): TransformMatrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ]
}

export function applyMatrixToPoint(x: number, y: number, matrix: TransformMatrix): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  }
}

export function applyMatrixToBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  matrix: TransformMatrix
): { x: number; y: number; width: number; height: number } {
  const points = [
    applyMatrixToPoint(x, y, matrix),
    applyMatrixToPoint(x + width, y, matrix),
    applyMatrixToPoint(x, y + height, matrix),
    applyMatrixToPoint(x + width, y + height, matrix)
  ]

  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function applyTransform(
  x: number,
  y: number,
  width: number,
  height: number,
  transform: Transform | undefined
): { x: number; y: number; width: number; height: number } {
  if (!transform) {
    return { x, y, width, height }
  }

  if (transform.matrix) {
    return applyMatrixToBounds(x, y, width, height, transform.matrix)
  }

  let newX = x
  let newY = y
  let newWidth = width
  let newHeight = height

  if (transform.scaleX !== undefined && transform.scaleX !== 1) {
    newX *= transform.scaleX
    newWidth *= transform.scaleX
  }

  if (transform.scaleY !== undefined && transform.scaleY !== 1) {
    newY *= transform.scaleY
    newHeight *= transform.scaleY
  }

  newX += transform.translateX || 0
  newY += transform.translateY || 0

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight
  }
}

export function mergeTransformIntoElement(
  element: Record<string, unknown>,
  parentMatrix: TransformMatrix
): Record<string, unknown> {
  const ownMatrix = parseTransformToMatrix(getAttr(element, 'transform'))
  const mergedMatrix = multiplyMatrices(parentMatrix, ownMatrix)
  const result: Record<string, unknown> = { ...element }
  result['@_transform'] = matrixToTransformString(mergedMatrix)
  return result
}

export function getVisibility(element: Record<string, unknown>): boolean {
  const visibility = getAttr(element, 'visibility')
  return visibility !== 'hidden' && visibility !== 'collapse'
}

export function getOpacity(element: Record<string, unknown>): number | undefined {
  const opacity = getAttr(element, 'opacity')
  if (!opacity) return undefined

  const parsed = parseFloat(opacity)
  if (Number.isNaN(parsed)) return undefined
  return Math.max(0, Math.min(1, parsed))
}

export function createGroup(
  groupData: Record<string, unknown>,
  children: Element[],
  id: string
): GroupElement {
  return {
    id,
    type: 'group',
    children,
    visible: getVisibility(groupData)
  }
}

export function matrixToTransformString(matrix: TransformMatrix): string {
  return `matrix(${matrix.map(value => roundNumber(value)).join(', ')})`
}

export function decomposeMatrix(matrix: TransformMatrix): {
  translateX: number
  translateY: number
  scaleX: number
  scaleY: number
  rotation: number
} {
  const [a, b, c, d, e, f] = matrix
  const scaleX = Math.hypot(a, b)
  const rotation = scaleX === 0 ? 0 : Math.atan2(b, a) * (180 / Math.PI)
  const determinant = a * d - b * c
  const scaleY = scaleX === 0 ? Math.hypot(c, d) : determinant / scaleX

  return {
    translateX: e,
    translateY: f,
    scaleX,
    scaleY,
    rotation
  }
}

function commandToMatrix(command: string, values: number[]): TransformMatrix {
  switch (command) {
    case 'matrix':
      if (values.length >= 6) {
        return [values[0], values[1], values[2], values[3], values[4], values[5]]
      }
      return identityMatrix()
    case 'translate':
      return [1, 0, 0, 1, values[0] || 0, values[1] || 0]
    case 'scale': {
      const sx = values[0] ?? 1
      const sy = values[1] ?? sx
      return [sx, 0, 0, sy, 0, 0]
    }
    case 'rotate': {
      const angle = (values[0] || 0) * (Math.PI / 180)
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const rotateMatrix: TransformMatrix = [cos, sin, -sin, cos, 0, 0]

      if (values.length >= 3) {
        const cx = values[1]
        const cy = values[2]
        return multiplyMatrices(
          multiplyMatrices([1, 0, 0, 1, cx, cy], rotateMatrix),
          [1, 0, 0, 1, -cx, -cy]
        )
      }

      return rotateMatrix
    }
    case 'skewX': {
      const angle = (values[0] || 0) * (Math.PI / 180)
      return [1, 0, Math.tan(angle), 1, 0, 0]
    }
    case 'skewY': {
      const angle = (values[0] || 0) * (Math.PI / 180)
      return [1, Math.tan(angle), 0, 1, 0, 0]
    }
    default:
      return identityMatrix()
  }
}

function parseTransformNumbers(raw: string): number[] {
  return raw
    .trim()
    .split(/[\s,]+/)
    .map(value => parseFloat(value))
    .filter(value => !Number.isNaN(value))
}

function roundNumber(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(6))
}

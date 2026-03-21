// Path parsing utilities - convert SVG path data to structured PathPoint[]
import type { PathPoint, MoveToPoint, LineToPoint, CurvePoint, ArcPoint, ClosePoint, CubicCurve, QuadraticCurve, ArcCurve } from '../../sif/types/elements/shape'

interface PathCommandResult {
  points: PathPoint[]
  current: { x: number; y: number }
  subpathStart: { x: number; y: number }
}

/**
 * Parse SVG path data string into structured PathPoint array.
 * Supports M, L, Z, C, Q, A commands (and their lowercase relative variants).
 * Smooth commands (S, T) are converted to their base forms (C, Q).
 * Axis-aligned commands (H, V) are converted to L.
 */
export function parsePathToPoints(d: string): PathPoint[] {
  const tokens = tokenizePath(d)
  const points: PathPoint[] = []
  let current = { x: 0, y: 0 }
  let subpathStart = { x: 0, y: 0 }
  let lastControl = { x: 0, y: 0 }  // For S command reflection
  let lastQuadraticControl = { x: 0, y: 0 }  // For T command reflection

  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]

    // Handle implicit repeat - if current token is a number, use last command
    if (!isNaN(Number(cmd))) {
      // This is a coordinate, not a command - use the last specified command
      i--
    }

    i++

    switch (cmd.toUpperCase()) {
      case 'M': {
        const relative = cmd === 'm'
        const { x, y, newI } = readPoint(tokens, i)
        i = newI
        const absX = relative ? current.x + x : x
        const absY = relative ? current.y + y : y
        points.push({ x: absX, y: absY, type: cmd as 'M' | 'm', moveTo: true })
        current = { x: absX, y: absY }
        subpathStart = { x: absX, y: absY }
        lastControl = { x: absX, y: absY }
        lastQuadraticControl = { x: absX, y: absY }
        // After M, subsequent coordinates are treated as L
        while (i < tokens.length && !isCommand(tokens[i])) {
          const { x: lx, y: ly, newI: newI2 } = readPoint(tokens, i)
          i = newI2
          const absLx = relative ? current.x + lx : lx
          const absLy = relative ? current.y + ly : ly
          points.push({ x: absLx, y: absLy, type: relative ? 'l' : 'L' })
          current = { x: absLx, y: absLy }
          lastControl = { x: absLx, y: absLy }
          lastQuadraticControl = { x: absLx, y: absLy }
        }
        break
      }

      case 'L': {
        const relative = cmd === 'l'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const { x, y, newI } = readPoint(tokens, i)
          i = newI
          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y
          points.push({ x: absX, y: absY, type: cmd as 'L' | 'l' })
          current = { x: absX, y: absY }
          lastControl = { x: absX, y: absY }
          lastQuadraticControl = { x: absX, y: absY }
        }
        break
      }

      case 'H': {
        const relative = cmd === 'h'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const x = parseFloat(tokens[i])
          i++
          const absX = relative ? current.x + x : x
          points.push({ x: absX, y: current.y, type: relative ? 'l' : 'L' })
          current = { x: absX, y: current.y }
          lastControl = { x: absX, y: current.y }
          lastQuadraticControl = { x: absX, y: current.y }
        }
        break
      }

      case 'V': {
        const relative = cmd === 'v'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const y = parseFloat(tokens[i])
          i++
          const absY = relative ? current.y + y : y
          points.push({ x: current.x, y: absY, type: relative ? 'l' : 'L' })
          current = { x: current.x, y: absY }
          lastControl = { x: current.x, y: absY }
          lastQuadraticControl = { x: current.x, y: absY }
        }
        break
      }

      case 'C': {
        const relative = cmd === 'c'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const x1 = parseFloat(tokens[i])
          const y1 = parseFloat(tokens[i + 1])
          const x2 = parseFloat(tokens[i + 2])
          const y2 = parseFloat(tokens[i + 3])
          const x = parseFloat(tokens[i + 4])
          const y = parseFloat(tokens[i + 5])
          i += 6

          const absX1 = relative ? current.x + x1 : x1
          const absY1 = relative ? current.y + y1 : y1
          const absX2 = relative ? current.x + x2 : x2
          const absY2 = relative ? current.y + y2 : y2
          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y

          const curve: CubicCurve = {
            type: 'cubic',
            x1: absX1,
            y1: absY1,
            x2: absX2,
            y2: absY2
          }
          points.push({ x: absX, y: absY, type: cmd as 'C' | 'c', curve })
          current = { x: absX, y: absY }
          lastControl = { x: absX2, y: absY2 }
          lastQuadraticControl = { x: absX, y: absY }
        }
        break
      }

      case 'S': {
        const relative = cmd === 's'
        while (i < tokens.length && !isCommand(tokens[i])) {
          // S command: reflect last control point relative to current point
          const reflectX = 2 * current.x - lastControl.x
          const reflectY = 2 * current.y - lastControl.y
          const x2 = parseFloat(tokens[i])
          const y2 = parseFloat(tokens[i + 1])
          const x = parseFloat(tokens[i + 2])
          const y = parseFloat(tokens[i + 3])
          i += 4

          const absX2 = relative ? current.x + x2 : x2
          const absY2 = relative ? current.y + y2 : y2
          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y

          const curve: CubicCurve = {
            type: 'cubic',
            x1: reflectX,
            y1: reflectY,
            x2: absX2,
            y2: absY2
          }
          points.push({ x: absX, y: absY, type: 'C', curve })  // S becomes C
          current = { x: absX, y: absY }
          lastControl = { x: absX2, y: absY2 }
          lastQuadraticControl = { x: absX, y: absY }
        }
        break
      }

      case 'Q': {
        const relative = cmd === 'q'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const x1 = parseFloat(tokens[i])
          const y1 = parseFloat(tokens[i + 1])
          const x = parseFloat(tokens[i + 2])
          const y = parseFloat(tokens[i + 3])
          i += 4

          const absX1 = relative ? current.x + x1 : x1
          const absY1 = relative ? current.y + y1 : y1
          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y

          const curve: QuadraticCurve = {
            type: 'quadratic',
            x1: absX1,
            y1: absY1
          }
          points.push({ x: absX, y: absY, type: cmd as 'Q' | 'q', curve })
          current = { x: absX, y: absY }
          lastControl = { x: absX1, y: absY1 }
          lastQuadraticControl = { x: absX1, y: absY1 }
        }
        break
      }

      case 'T': {
        const relative = cmd === 't'
        while (i < tokens.length && !isCommand(tokens[i])) {
          // T command: reflect last quadratic control point
          const reflectX = 2 * current.x - lastQuadraticControl.x
          const reflectY = 2 * current.y - lastQuadraticControl.y
          const x = parseFloat(tokens[i])
          const y = parseFloat(tokens[i + 1])
          i += 2

          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y

          const curve: QuadraticCurve = {
            type: 'quadratic',
            x1: reflectX,
            y1: reflectY
          }
          points.push({ x: absX, y: absY, type: 'Q', curve })  // T becomes Q
          current = { x: absX, y: absY }
          lastControl = { x: reflectX, y: reflectY }
          lastQuadraticControl = { x: reflectX, y: reflectY }
        }
        break
      }

      case 'A': {
        const relative = cmd === 'a'
        while (i < tokens.length && !isCommand(tokens[i])) {
          const rX = parseFloat(tokens[i])
          const rY = parseFloat(tokens[i + 1])
          const rotation = parseFloat(tokens[i + 2])
          const largeArc = parseInt(tokens[i + 3]) === 1
          const sweep = parseInt(tokens[i + 4]) === 1
          const x = parseFloat(tokens[i + 5])
          const y = parseFloat(tokens[i + 6])
          i += 7

          const absX = relative ? current.x + x : x
          const absY = relative ? current.y + y : y

          const curve: ArcCurve = {
            type: 'arc',
            rX,
            rY,
            rotation,
            largeArc,
            sweep
          }
          points.push({ x: absX, y: absY, type: cmd as 'A' | 'a', curve })
          current = { x: absX, y: absY }
          lastControl = { x: absX, y: absY }
          lastQuadraticControl = { x: absX, y: absY }
        }
        break
      }

      case 'Z': {
        points.push({ close: true, type: 'Z' })
        current = { ...subpathStart }
        i++  // Z takes no arguments
        break
      }

      default:
        i++  // Skip unknown command
    }
  }

  return points
}

/**
 * Tokenize SVG path data into command and coordinate tokens
 */
function tokenizePath(d: string): string[] {
  const regex = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g
  return d.match(regex) || []
}

/**
 * Check if a token is a command (letter) vs a number
 */
function isCommand(token: string): boolean {
  return /^[a-zA-Z]$/.test(token)
}

/**
 * Read a point (x, y) from the token array
 */
function readPoint(tokens: string[], i: number): { x: number; y: number; newI: number } {
  const x = parseFloat(tokens[i])
  const y = parseFloat(tokens[i + 1])
  return { x, y, newI: i + 2 }
}

/**
 * Check if path contains any arc commands
 */
export function pathHasArc(d: string): boolean {
  return /[Aa]/.test(d)
}

/**
 * Check if path contains any quadratic or cubic bezier commands
 */
export function pathHasBezier(d: string): boolean {
  return /[CcQqSsTt]/.test(d)
}
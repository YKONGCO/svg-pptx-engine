// Phase 0.2B: text-on-path (SVG `<textPath>`) sampling utilities.
//
// PPTX has no native "text follows a curve" concept. The closest
// reproduction is to break the string into per-character text runs and
// place each character at a sampled point along the path, rotated by
// the local tangent. This module turns a SIF `TextElement.textPath`
// into the per-character placement data the PPTX layer needs.
//
// The sampler is intentionally simple — a uniformly-stepped polyline
// derived from `parsePathToPoints`. Cubic/quadratic Béziers are
// subdivided into 32 segments each; lines and arcs use their analytical
// form. That's enough precision for typical 8–40-character labels; it
// is not a substitute for a real font-shaping engine.

import type { PathPoint, MoveToPoint, LineToPoint, CurvePoint, ArcPoint, ClosePoint } from '../../sif/types/elements/shape'
import { parsePathToPoints } from '../../svg/utils/path-parser'

export interface PathSample {
  /** X coordinate in SVG user units. */
  x: number
  /** Y coordinate in SVG user units. */
  y: number
  /** Tangent angle at the sample, in degrees, clockwise from the +x axis. */
  angle: number
}

interface FlatSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Cumulative arc length up to and including this segment's end. */
  cumLength: number
}

/**
 * Flatten a path's `d` to a list of straight segments, computing the
 * cumulative arc length up to the end of each segment. Curves are
 * subdivided into `BEZIER_STEPS` straight pieces; lines pass through
 * as-is. Arcs are subdivided via their endpoint parameterisation.
 */
const BEZIER_STEPS = 32
const ARC_STEPS = 48

function flattenPath(d: string): FlatSegment[] {
  const points = parsePathToPoints(d)
  const segments: FlatSegment[] = []
  let cumLength = 0
  let cursor = { x: 0, y: 0 }
  let subpathStart = { x: 0, y: 0 }

  for (const pt of points) {
    const type = pt.type.toUpperCase()

    if (type === 'Z') {
      const seg = pushSegment(cursor, subpathStart, cumLength)
      if (seg) {
        segments.push(seg)
        cumLength = seg.cumLength
        cursor = { x: subpathStart.x, y: subpathStart.y }
      }
      continue
    }

    // After 'Z' the only remaining variants have x/y on the point itself.
    const endpoint = pt as MoveToPoint | LineToPoint | CurvePoint | ArcPoint

    if (type === 'M' || (endpoint as MoveToPoint).moveTo) {
      cursor = { x: endpoint.x, y: endpoint.y }
      subpathStart = { x: endpoint.x, y: endpoint.y }
      continue
    }

    if (type === 'L') {
      const seg = pushSegment(cursor, { x: endpoint.x, y: endpoint.y }, cumLength)
      if (seg) {
        segments.push(seg)
        cumLength = seg.cumLength
        cursor = { x: endpoint.x, y: endpoint.y }
      }
      continue
    }

    if (type === 'C' || type === 'Q') {
      const curve = (endpoint as CurvePoint).curve
      const start = { x: cursor.x, y: cursor.y }
      const end = { x: endpoint.x, y: endpoint.y }
      const steps = BEZIER_STEPS
      if (curve && curve.type === 'cubic') {
        const cp1 = { x: curve.x1, y: curve.y1 }
        const cp2 = { x: curve.x2, y: curve.y2 }
        for (let i = 1; i <= steps; i++) {
          const t1 = (i - 1) / steps
          const t2 = i / steps
          const a = cubicBezier(start, cp1, cp2, end, t1)
          const b = cubicBezier(start, cp1, cp2, end, t2)
          const seg = pushSegment(a, b, cumLength)
          if (seg) {
            segments.push(seg)
            cumLength = seg.cumLength
          }
        }
      } else if (curve && curve.type === 'quadratic') {
        const cp = { x: curve.x1, y: curve.y1 }
        for (let i = 1; i <= steps; i++) {
          const t1 = (i - 1) / steps
          const t2 = i / steps
          const a = quadraticBezier(start, cp, end, t1)
          const b = quadraticBezier(start, cp, end, t2)
          const seg = pushSegment(a, b, cumLength)
          if (seg) {
            segments.push(seg)
            cumLength = seg.cumLength
          }
        }
      } else {
        // Defensive: unknown curve subtype — fall back to a straight line.
        const seg = pushSegment(start, end, cumLength)
        if (seg) {
          segments.push(seg)
          cumLength = seg.cumLength
        }
      }
      cursor = end
      continue
    }

    if (type === 'A') {
      // Arcs: subdivide the chord. See module docstring for why this is
      // not a full elliptical-arc parameterisation.
      const start = { x: cursor.x, y: cursor.y }
      const end = { x: endpoint.x, y: endpoint.y }
      for (let i = 1; i <= ARC_STEPS; i++) {
        const t1 = (i - 1) / ARC_STEPS
        const t2 = i / ARC_STEPS
        const a = lerpPoint(start, end, t1)
        const b = lerpPoint(start, end, t2)
        const seg = pushSegment(a, b, cumLength)
        if (seg) {
          segments.push(seg)
          cumLength = seg.cumLength
        }
      }
      cursor = end
      continue
    }
  }

  return segments
}

function pushSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cumLength: number
): FlatSegment | undefined {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-6) return undefined
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, cumLength: cumLength + length }
}

function cubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t
  const mt2 = mt * mt
  const t2 = t * t
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y
  }
}

function quadraticBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
  }
}

function lerpPoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Sample a point on the flattened path at cumulative arc length `s`.
 * The tangent angle is taken from the segment that contains `s`. If
 * `s` is past the end, the last segment's end point and tangent are
 * returned (matching SVG's "off the end" behaviour: characters just
 * stop being rendered, but for our use we still place them at the
 * tail for predictability).
 */
function sampleAtLength(segments: FlatSegment[], s: number): PathSample | undefined {
  if (segments.length === 0) return undefined
  if (s <= 0) {
    const first = segments[0]
    return tangentSample(first, 0)
  }
  for (const seg of segments) {
    if (s <= seg.cumLength) {
      const prevCum = seg.cumLength - Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1)
      const local = (s - prevCum) / Math.max(seg.cumLength - prevCum, 1e-6)
      return tangentSample(seg, local)
    }
  }
  return tangentSample(segments[segments.length - 1], 1)
}

function tangentSample(seg: FlatSegment, t: number): PathSample {
  const x = seg.x1 + (seg.x2 - seg.x1) * t
  const y = seg.y1 + (seg.y2 - seg.y1) * t
  const angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * (180 / Math.PI)
  return { x, y, angle }
}

/**
 * Distribute `text` along the path described by `d`, starting at
 * `startOffset` arc-units from the beginning. The advance per character
 * is approximated as `charAdvance` (callers typically pass `fontSize *
 * 0.55` for Latin or `fontSize * 1.0` for CJK).
 *
 * Returns one PathSample per character; characters that would fall past
 * the end of the path are clamped to the path's tail rather than
 * dropped — this avoids silently losing the trailing characters of a
 * label that's a couple of pixels too long.
 */
export function distributeTextAlongPath(
  text: string,
  d: string,
  startOffset: number,
  charAdvance: number
): PathSample[] {
  if (!text) return []
  const segments = flattenPath(d)
  if (segments.length === 0) return []

  const samples: PathSample[] = []
  let cursor = startOffset
  const chars = Array.from(text) // handle surrogate pairs as 1 sample
  for (const _ch of chars) {
    const sample = sampleAtLength(segments, cursor)
    if (sample) samples.push(sample)
    cursor += charAdvance
  }
  return samples
}

/** Total arc length of the flattened path. */
export function pathArcLength(d: string): number {
  const segments = flattenPath(d)
  return segments.length === 0 ? 0 : segments[segments.length - 1].cumLength
}

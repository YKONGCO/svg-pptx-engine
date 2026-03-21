// Shape element types
import { BaseElement } from './base'
import { Fill } from '../style/fill'
import { Stroke } from '../style/stroke'

export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'path' | 'line' | 'polygon' | 'polyline'

/**
 * Base properties for all shapes
 */
export interface BaseShape extends BaseElement {
  type: 'shape'
  shapeType: ShapeType

  // Fill and stroke
  fill: Fill
  stroke?: Stroke

  // Rotation (degrees)
  rotation?: number
}

// =============================================================================
// PathPoint types for structured path data (used by CUSTOM_GEOMETRY)
// =============================================================================

/**
 * MoveTo point - starts a new subpath
 */
export interface MoveToPoint {
  x: number
  y: number
  type: 'M' | 'm'
  moveTo: true
}

/**
 * LineTo point - draws a straight line
 */
export interface LineToPoint {
  x: number
  y: number
  type: 'L' | 'l'
}

/**
 * Cubic bezier curve point
 */
export interface CubicCurve {
  type: 'cubic'
  x1: number  // control point 1 X
  y1: number  // control point 1 Y
  x2: number  // control point 2 X
  y2: number  // control point 2 Y
}

/**
 * Quadratic bezier curve point
 */
export interface QuadraticCurve {
  type: 'quadratic'
  x1: number  // control point X
  y1: number  // control point Y
}

/**
 * Arc curve point
 */
export interface ArcCurve {
  type: 'arc'
  rX: number   // X radius
  rY: number   // Y radius
  rotation: number  // X-axis rotation in degrees
  largeArc: boolean  // large arc flag
  sweep: boolean    // sweep direction flag
}

/**
 * Curve point - contains cubic or quadratic bezier
 */
export interface CurvePoint {
  x: number
  y: number
  type: 'C' | 'c' | 'Q' | 'q'
  curve: CubicCurve | QuadraticCurve
}

/**
 * Arc point - SVG arc command
 */
export interface ArcPoint {
  x: number
  y: number
  type: 'A' | 'a'
  curve: ArcCurve
}

/**
 * Close point - closes the current subpath
 */
export interface ClosePoint {
  close: true
  type: 'Z' | 'z'
}

/**
 * Union type for all path point types
 */
export type PathPoint = MoveToPoint | LineToPoint | CurvePoint | ArcPoint | ClosePoint

/**
 * Rectangle shape
 */
export interface RectShape extends BaseShape {
  shapeType: 'rect'
  rx?: number   // corner radius X
  ry?: number   // corner radius Y
}

/**
 * Circle shape (using ellipse with equal radii)
 */
export interface CircleShape extends BaseShape {
  shapeType: 'circle'
  cx?: number   // center X (computed if not provided)
  cy?: number   // center Y
  r?: number    // radius
}

/**
 * Ellipse shape
 */
export interface EllipseShape extends BaseShape {
  shapeType: 'ellipse'
  cx?: number   // center X
  cy?: number   // center Y
  rx?: number   // radius X
  ry?: number   // radius Y
}

/**
 * Path shape (SVG path data)
 */
export interface PathShape extends BaseShape {
  shapeType: 'path'
  d: string     // SVG path data
  fillRule?: 'nonzero' | 'evenodd'
  /**
   * Structured path points for CUSTOM_GEOMETRY export.
   * When provided, pptx exporter will use these points directly
   * instead of rasterizing the path.
   */
  points?: PathPoint[]
}

/**
 * Line shape (straight line)
 */
export interface LineShape extends BaseShape {
  shapeType: 'line'
  x1: number    // start X
  y1: number    // start Y
  x2: number    // end X
  y2: number    // end Y
}

/**
 * Polygon shape (closed path with straight lines)
 */
export interface PolygonShape extends BaseShape {
  shapeType: 'polygon'
  points: string  // "x1,y1 x2,y2 ..."
}

/**
 * Polyline shape (open path with straight lines)
 */
export interface PolylineShape extends BaseShape {
  shapeType: 'polyline'
  points: string  // "x1,y1 x2,y2 ..."
}

/**
 * Union of all shape types
 */
export type ShapeElement = RectShape | CircleShape | EllipseShape | PathShape | LineShape | PolygonShape | PolylineShape

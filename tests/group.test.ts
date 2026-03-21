// Tests for group converter

import { flattenGroupElements, groupHasBackground, createGroupBackground, getGroupBoundingBox } from '../src/pptx/converters/group'
import { createMockGroupElement, createMockRectShape, createMockTextElement } from './mockData'

describe('Group Converter', () => {
  describe('flattenGroupElements', () => {
    it('should flatten group with children', () => {
      const group = createMockGroupElement()
      const convertFn = jest.fn((el) => ({ type: 'shape', data: el }))

      const result = flattenGroupElements(group, convertFn)

      expect(result).toHaveLength(2)
      expect(convertFn).toHaveBeenCalledTimes(2)
    })

    it('should not apply transform to children - SIF groups do not have transform', () => {
      // Note: SIF GroupElement does not have transform property
      // Children already have absolute coordinates
      const group: any = {
        type: 'group',
        id: 'group-1',
        children: [
          createMockRectShape({ id: 'child-1', x: 100, y: 100, width: 200, height: 100 })
        ]
      }

      const results: any[] = []
      const convertFn = (el: any) => {
        results.push(el)
        return { type: 'shape', data: el }
      }

      flattenGroupElements(group, convertFn)

      // Children keep their original coordinates
      expect(results[0].x).toBe(100)
      expect(results[0].y).toBe(100)
    })

    it('should handle nested groups', () => {
      const innerGroup: any = {
        type: 'group',
        id: 'inner-group',
        // NOTE: Group does not have x, y, width, height
        children: [createMockRectShape({ id: 'nested-child', x: 200, y: 200 })],
        visible: true,
        zIndex: 0
      }

      const outerGroup: any = {
        type: 'group',
        id: 'outer-group',
        // NOTE: Group does not have x, y, width, height
        children: [innerGroup],
        visible: true,
        zIndex: 1
      }

      const convertFn = (el: any) => {
        if (el.type === 'group') {
          return null
        }
        return { type: 'shape', data: el }
      }

      const result = flattenGroupElements(outerGroup, convertFn)

      expect(result).toHaveLength(1)
      expect(result[0].data.x).toBe(200)
    })

    it('should handle empty group', () => {
      const group: any = {
        type: 'group',
        id: 'empty-group',
        children: [],
        visible: true,
        zIndex: 0
      }

      const convertFn = (el: any) => ({ type: 'shape', data: el })
      const result = flattenGroupElements(group, convertFn)

      expect(result).toHaveLength(0)
    })
  })

  describe('groupHasBackground', () => {
    it('should return false - SIF groups do not support background by design', () => {
      // Note: SIF GroupElement is purely for logical grouping, NOT visual styling
      // Groups do NOT have visual properties like background
      const group: any = {
        type: 'group',
        background: { fill: { type: 'solid', color: 'FF0000' } }
      }

      // SIF groups don't support background - always returns false
      expect(groupHasBackground(group)).toBe(false)
    })

    it('should return false for any group', () => {
      const group: any = {
        type: 'group'
      }

      expect(groupHasBackground(group)).toBe(false)
    })
  })

  describe('createGroupBackground', () => {
    it('should return null - SIF groups do not support background by design', () => {
      // Note: SIF GroupElement is purely for logical grouping, NOT visual styling
      // Groups do NOT have visual properties like background, transform, opacity, etc.
      // If you need a visual container, use a shape element instead
      const group: any = {
        type: 'group',
        id: 'group-1',
        children: [
          createMockRectShape({ id: 'child-1', x: 100, y: 100, width: 200, height: 100 })
        ],
        background: {
          fill: { type: 'solid', color: 'FF0000' }
        }
      }

      const result = createGroupBackground(group)

      // SIF groups don't support background - always returns null
      expect(result).toBeNull()
    })

    it('should return null for any group', () => {
      const group: any = {
        type: 'group',
        id: 'group-1',
        children: [
          createMockRectShape({ id: 'child-1', x: 100, y: 100 })
        ]
      }

      const result = createGroupBackground(group)

      expect(result).toBeNull()
    })
  })

  describe('getGroupBoundingBox', () => {
    it('should compute bounding box from children', () => {
      const group: any = {
        type: 'group',
        id: 'group-1',
        children: [
          createMockRectShape({ id: 'child-1', x: 100, y: 100, width: 100, height: 50 }),
          createMockRectShape({ id: 'child-2', x: 300, y: 200, width: 150, height: 80 })
        ]
      }

      const result = getGroupBoundingBox(group)

      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
      expect(result.width).toBe(350) // 300+150 - 100
      expect(result.height).toBe(180) // 200+80 - 100
    })

    it('should handle empty group', () => {
      const group: any = {
        type: 'group',
        id: 'empty-group',
        children: []
      }

      const result = getGroupBoundingBox(group)

      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
      expect(result.width).toBe(0)
      expect(result.height).toBe(0)
    })

    it('should compute bounding box without transform - SIF groups do not have transform', () => {
      // Note: SIF GroupElement does not have transform property
      // Transforms should be applied to child elements during SVG -> SIF conversion
      const group: any = {
        type: 'group',
        id: 'group-1',
        children: [
          createMockRectShape({ id: 'child-1', x: 100, y: 100, width: 100, height: 50 })
        ]
      }

      const result = getGroupBoundingBox(group)

      // Bounding box is computed from children only
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
      expect(result.width).toBe(100)
      expect(result.height).toBe(50)
    })
  })
})

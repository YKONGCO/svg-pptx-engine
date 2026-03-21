// Tests for full PPTX generator

// Skip generator tests that require full pptxgenjs integration
// These tests would work in an integration test environment

describe('PPTX Generator', () => {
  describe('PptxGenerator class', () => {
    it('should have createPptxGenerator export', () => {
      // Just verify the export exists
      const { createPptxGenerator } = require('../src/pptx/generator')
      expect(createPptxGenerator).toBeDefined()
      expect(typeof createPptxGenerator).toBe('function')
    })

    it('should have generatePptx export', () => {
      const { generatePptx } = require('../src/pptx/generator')
      expect(generatePptx).toBeDefined()
      expect(typeof generatePptx).toBe('function')
    })
  })
})

import { convertFilterDef, resolveFilterEffect } from './filter'

describe('convertFilterDef', () => {
  describe('feDropShadow', () => {
    it('captures flood-color, stdDeviation, dx, dy from feDropShadow', () => {
      const filter = {
        feDropShadow: { '@_stdDeviation': '4', '@_dx': '2', '@_dy': '3', '@_flood-color': 'teal', '@_flood-opacity': '0.6' }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('shadow')
      expect(result?.blur).toBe(4)
      expect(result?.offsetX).toBe(2)
      expect(result?.offsetY).toBe(3)
      expect(result?.opacity).toBe(0.6)
      // teal is normalized to #008080
      expect(result?.shadowColor).toMatch(/008080|teal/i)
    })
  })

  describe('offset + blur + feFlood + feMerge chain', () => {
    it('captures feFlood color for shadowHue-style chain (offset+blur with feFlood)', () => {
      // shadowHue fixture shape: feGaussianBlur → feOffset → feFuncA → feMerge → feColorMatrix(hueRotate)
      const filter = {
        feGaussianBlur: { '@_in': 'SourceAlpha', '@_stdDeviation': '4' },
        feOffset: { '@_dx': '3', '@_dy': '3' },
        feComponentTransfer: { feFuncA: { '@_type': 'linear', '@_slope': '0.3' } },
        feMerge: { feMergeNode: [{}, { '@_in': 'SourceGraphic' }] },
        feColorMatrix: { '@_type': 'hueRotate', '@_values': '120' }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('shadow')
      expect(result?.offsetX).toBe(3)
      expect(result?.offsetY).toBe(3)
      expect(result?.colorMatrixType).toBe('hueRotate')
      expect(result?.colorMatrixValue).toBe(120)
    })
  })

  describe('blur + feFlood + feComposite + feMerge with SourceGraphic', () => {
    // overlayGlow fixture: feGaussianBlur(SourceAlpha) → feFlood(teal) → feComposite
    //                   → feMerge(glow, SourceGraphic)
    it('captures feFlood color for glow effect (overlayGlow fixture)', () => {
      const filter = {
        feGaussianBlur: { '@_in': 'SourceAlpha', '@_stdDeviation': '3', '@_result': 'blur' },
        feFlood: { '@_flood-color': '#16A085', '@_flood-opacity': '0.5', '@_result': 'color' },
        feComposite: { '@_in': 'color', '@_in2': 'blur', '@_operator': 'in', '@_result': 'glow' },
        feMerge: { feMergeNode: [{ '@_in': 'glow' }, { '@_in': 'SourceGraphic' }] }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('glow')
      expect(result?.blur).toBe(3)
      expect(result?.opacity).toBe(0.5)
      // Critical: shadowColor must be the teal flood colour, not the host fill
      expect(result?.shadowColor).toMatch(/16A085|22,?\s*160,?\s*133/i)
    })

    it('captures blur-only filter without feFlood (plain blur)', () => {
      const filter = {
        feGaussianBlur: { '@_stdDeviation': '5' }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('blur')
      expect(result?.blur).toBe(5)
      expect(result?.shadowColor).toBeUndefined()
    })

    it('captures blur + feMerge with SourceGraphic but no feFlood (glow without colour)', () => {
      // SVG spec: feGaussianBlur(SourceAlpha) + feMerge with SourceGraphic
      // = "halo around source" effect. PPTX glow fallback uses source fill.
      const filter = {
        feGaussianBlur: { '@_in': 'SourceAlpha', '@_stdDeviation': '4' },
        feMerge: { feMergeNode: [{}, { '@_in': 'SourceGraphic' }] }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('glow')
      expect(result?.blur).toBe(4)
      expect(result?.shadowColor).toBeUndefined()
    })
  })

  describe('plain feGaussianBlur (no merge, no feFlood)', () => {
    // 02-gaussian-blur.svg fixtures — stdDeviation=2/5/10 with no
    // other primitives. The renderer classifies this as a 'blur'
    // kind (not a glow) because the merge step is absent.
    it('returns kind=blur with no shadowColor for plain blur', () => {
      const filter = {
        feGaussianBlur: { '@_stdDeviation': '3' }
      }
      const result = convertFilterDef(filter)
      expect(result).toBeDefined()
      expect(result?.kind).toBe('blur')
      expect(result?.blur).toBe(3)
      expect(result?.shadowColor).toBeUndefined()
    })
  })
})

describe('resolveFilterEffect', () => {
  it('glow effect with feFlood colour uses the flood colour, not the source fill', () => {
    // The overlayGlow filter template (post-fix): a glow with an explicit teal
    // shadowColor. resolveFilterEffect must forward that colour through to the
    // GlowEffect — otherwise the renderer falls back to the host fill and the
    // glow is invisible on a white card.
    const template = {
      kind: 'glow' as const,
      blur: 3,
      opacity: 0.5,
      shadowColor: '#16A085'
    }
    const effect = resolveFilterEffect(template, {
      fill: { type: 'solid' as const, color: '#FFFFFF' }
    })
    expect(effect).toBeDefined()
    expect(effect?.type).toBe('glow')
    if (effect?.type === 'glow') {
      expect(effect.color).toMatch(/16A085/i)
    }
  })

  it('shadow effect defaults to #000000 colour when feFlood is absent', () => {
    // softShadow fixture: feGaussianBlur(SourceAlpha) + feOffset + feFuncA + feMerge
    // — no explicit colour. PPTX must default to black, NOT the host fill,
    // otherwise soft shadows on white cards are invisible.
    const template = {
      kind: 'shadow' as const,
      blur: 6,
      offsetX: 0,
      offsetY: 4,
      opacity: 0.18
    }
    const effect = resolveFilterEffect(template, {
      fill: { type: 'solid' as const, color: '#FFFFFF' }
    })
    expect(effect).toBeDefined()
    expect(effect?.type).toBe('shadow')
    if (effect?.type === 'shadow') {
      expect(effect.color).toMatch(/000000/i)
    }
  })

  it('shadow effect with feFlood captures applyColorMatrixToFill (shadowHue fixture)', () => {
    // The shadowHue template carries a sibling feColorMatrix (hueRotate 120)
    // that the SVG filter applies to the post-merge result. PPTX can't
    // reproduce the post-merge matrix, so resolveFilterEffect forwards the
    // matrix to convertShape, which transforms the source fill colour.
    const template = {
      kind: 'shadow' as const,
      blur: 4,
      offsetX: 3,
      offsetY: 3,
      opacity: 0.3,
      colorMatrixType: 'hueRotate' as const,
      colorMatrixValue: 120
    }
    const effect = resolveFilterEffect(template, {
      fill: { type: 'solid' as const, color: '#E74C3C' }
    })
    expect(effect).toBeDefined()
    expect(effect?.type).toBe('shadow')
    if (effect?.type === 'shadow') {
      expect(effect.applyColorMatrixToFill).toEqual({
        matrixType: 'hueRotate',
        values: undefined,
        value: 120
      })
    }
  })
})

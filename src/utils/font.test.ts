import {
  FONT_BRIDGE,
  DEFAULT_FONT_BRIDGE,
  DEFAULT_FONT_PRESETS,
  containsCjk,
  firstFontFace,
  normaliseFontName,
  pickPptxFontForText,
  resolveFontBridge,
  resolvePptxEastAsiaFont,
  resolvePptxFontFace,
  resolvePptxLatinFont,
  resolveWebFontFamily
} from './font'

describe('font resolver', () => {
  describe('containsCjk', () => {
    it('returns false for empty / whitespace', () => {
      expect(containsCjk('')).toBe(false)
    })

    it('returns false for pure Latin', () => {
      expect(containsCjk('Hello world')).toBe(false)
      expect(containsCjk('123 + 456 = 579')).toBe(false)
    })

    it('returns true for Han characters', () => {
      expect(containsCjk('你好')).toBe(true)
      expect(containsCjk('Hello 你好')).toBe(true)
    })

    it('returns true for Korean Hangul', () => {
      expect(containsCjk('안녕')).toBe(true)
    })
  })

  describe('normaliseFontName', () => {
    it('trims and unquotes', () => {
      expect(normaliseFontName('  "Microsoft YaHei"  ')).toBe('Microsoft YaHei')
    })

    it('returns empty string for empty / nullish input', () => {
      expect(normaliseFontName('')).toBe('')
      expect(normaliseFontName(undefined)).toBe('')
      expect(normaliseFontName(null)).toBe('')
    })

    it('keeps Chinese names intact', () => {
      expect(normaliseFontName('微软雅黑')).toBe('微软雅黑')
    })
  })

  describe('firstFontFace', () => {
    it('returns the first face of a CSS chain', () => {
      expect(firstFontFace('"PingFang SC", "Microsoft YaHei", sans-serif')).toBe('PingFang SC')
    })

    it('handles unquoted single names', () => {
      expect(firstFontFace('Arial')).toBe('Arial')
    })

    it('returns empty string for nullish input', () => {
      expect(firstFontFace(undefined)).toBe('')
    })
  })

  describe('resolveFontBridge', () => {
    it('resolves Microsoft YaHei (English name)', () => {
      const bridge = resolveFontBridge('Microsoft YaHei')
      expect(bridge).toBe(FONT_BRIDGE['Microsoft YaHei'])
      expect(bridge.pptx.eastAsia).toBe('Microsoft YaHei')
      expect(bridge.pptx.latin).toBe('Arial')
    })

    it('resolves 微软雅黑 (Chinese name)', () => {
      const bridge = resolveFontBridge('微软雅黑')
      // The Chinese-name entry is structurally identical to the
      // English-name one (same eastAsia, same web chain) — that's
      // the point of the bridge: one resolution for both spellings.
      expect(bridge).toBe(FONT_BRIDGE['微软雅黑'])
      expect(bridge.pptx.eastAsia).toBe(FONT_BRIDGE['Microsoft YaHei'].pptx.eastAsia)
      expect(bridge.web).toBe(FONT_BRIDGE['Microsoft YaHei'].web)
    })

    it('resolves PingFang SC and falls back to Microsoft YaHei for PPTX', () => {
      const bridge = resolveFontBridge('PingFang SC')
      expect(bridge.pptx.eastAsia).toBe('Microsoft YaHei')
      // Web output should still mention PingFang SC first
      expect(bridge.web).toContain('PingFang SC')
    })

    it('is case-insensitive for ASCII names', () => {
      const lower = resolveFontBridge('microsoft yahei')
      const upper = resolveFontBridge('Microsoft YaHei')
      expect(lower).toBe(upper)
    })

    it('returns the default bridge for unknown fonts', () => {
      const bridge = resolveFontBridge('Some Random Font Nobody Uses')
      expect(bridge).toBe(DEFAULT_FONT_BRIDGE)
    })

    it('returns the default bridge for empty / nullish input', () => {
      expect(resolveFontBridge('')).toBe(DEFAULT_FONT_BRIDGE)
      expect(resolveFontBridge(undefined)).toBe(DEFAULT_FONT_BRIDGE)
      expect(resolveFontBridge(null)).toBe(DEFAULT_FONT_BRIDGE)
    })

    it('picks the first face of a CSS chain', () => {
      const bridge = resolveFontBridge('"Source Han Sans SC", "Microsoft YaHei"')
      expect(bridge).toBe(FONT_BRIDGE['Source Han Sans SC'])
    })

    it('resolves serif to a CJK-friendly serif bridge', () => {
      const bridge = resolveFontBridge('serif')
      expect(bridge.pptx.eastAsia).toBe('SimSun')
    })

    it('resolves sans-serif to the CJK-friendly default', () => {
      const bridge = resolveFontBridge('sans-serif')
      expect(bridge.pptx.eastAsia).toBe('Microsoft YaHei')
    })
  })

  describe('resolveWebFontFamily', () => {
    it('returns a CSS fallback chain', () => {
      const family = resolveWebFontFamily('Microsoft YaHei')
      expect(family).toContain('Microsoft YaHei')
      expect(family).toContain('微软雅黑')
      // Should mention at least one CJK-friendly fallback.
      expect(family).toMatch(/PingFang|Noto Sans|Source Han/)
    })

    it('passes through CSS chain input unchanged (resolved)', () => {
      const family = resolveWebFontFamily('"PingFang SC", "Microsoft YaHei", sans-serif')
      // The first face resolves to PingFang SC's bridge.
      expect(family).toContain('PingFang SC')
    })

    it('returns the CJK-first default for empty input', () => {
      const family = resolveWebFontFamily('')
      expect(family).toContain('Microsoft YaHei')
      expect(family).toContain('PingFang SC')
    })
  })

  describe('PPTX face selection', () => {
    it('resolvePptxFontFace prefers East-Asian face for CJK-aware families', () => {
      expect(resolvePptxFontFace('Microsoft YaHei')).toBe('Microsoft YaHei')
      expect(resolvePptxFontFace('SimSun')).toBe('SimSun')
      expect(resolvePptxFontFace('KaiTi')).toBe('KaiTi')
    })

    it('resolvePptxEastAsiaFont and resolvePptxLatinFont split correctly', () => {
      expect(resolvePptxEastAsiaFont('SimSun')).toBe('SimSun')
      expect(resolvePptxLatinFont('SimSun')).toBe('Times New Roman')

      expect(resolvePptxEastAsiaFont('Arial')).toBe('Microsoft YaHei')
      expect(resolvePptxLatinFont('Arial')).toBe('Arial')
    })

    it('pickPptxFontForText picks east-asia for CJK runs and latin for Latin runs', () => {
      // With a Microsoft YaHei authoring font, the CJK text gets
      // the East-Asian face and a pure Latin text gets the Latin
      // (Arial) face — the run-level CJK fix the user asked for.
      expect(pickPptxFontForText('Microsoft YaHei', '你好')).toBe('Microsoft YaHei')
      expect(pickPptxFontForText('Microsoft YaHei', 'Hello')).toBe('Arial')
      expect(pickPptxFontForText('Microsoft YaHei', 'Hello 你好')).toBe('Microsoft YaHei')
    })

    it('pickPptxFontForText resolves non-Chinese authoring fonts with a CJK fallback', () => {
      // The crucial fix: a Times New Roman authoring font with
      // Chinese text must still get a CJK-capable face, not the
      // Latin-only Times New Roman.
      expect(pickPptxFontForText('Times New Roman', '当 x = 2')).toBe('SimSun')
      expect(pickPptxFontForText('Times New Roman', 'x = 2')).toBe('Times New Roman')
    })
  })

  describe('DEFAULT_FONT_PRESETS', () => {
    it('is non-empty and has CJK-first ordering', () => {
      expect(DEFAULT_FONT_PRESETS.length).toBeGreaterThan(0)
      expect(DEFAULT_FONT_PRESETS[0]?.id).toBe('default')
    })

    it('every preset has a non-empty bridge with all three PPTX faces', () => {
      for (const preset of DEFAULT_FONT_PRESETS) {
        expect(preset.bridge.web.length).toBeGreaterThan(0)
        expect(preset.bridge.pptx.latin.length).toBeGreaterThan(0)
        expect(preset.bridge.pptx.eastAsia.length).toBeGreaterThan(0)
        expect(preset.bridge.pptx.complexScript.length).toBeGreaterThan(0)
      }
    })
  })

  describe('CJK-first defaults', () => {
    it('default web chain is CJK-first', () => {
      const defaultWeb = DEFAULT_FONT_BRIDGE.web
      const yaHeiIdx = defaultWeb.indexOf('Microsoft YaHei')
      const pingFangIdx = defaultWeb.indexOf('PingFang SC')
      expect(yaHeiIdx).toBeGreaterThanOrEqual(0)
      expect(yaHeiIdx).toBeLessThan(defaultWeb.indexOf('Arial'))
      expect(pingFangIdx).toBeGreaterThanOrEqual(0)
    })

    it('default PPTX eastAsia is Microsoft YaHei', () => {
      expect(DEFAULT_FONT_BRIDGE.pptx.eastAsia).toBe('Microsoft YaHei')
    })

    it('default PPTX latin is Arial', () => {
      expect(DEFAULT_FONT_BRIDGE.pptx.latin).toBe('Arial')
    })
  })
})

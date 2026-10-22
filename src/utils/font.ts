// CJK-first font resolver.
//
// SVG / CSS and PowerPoint don't share the same font naming model:
//   * CSS font-family lets you list a *fallback chain* — the browser
//     picks the first face installed on the host.
//   * PPTX has three script-specific typefaces in a single run
//     (`<a:latin>`, `<a:ea>`, `<a:cs>`); the renderer uses the
//     `ea` (East-Asian) face for CJK characters and `latin` for the
//     rest. PowerPoint won't fall back from "Microsoft YaHei" to
//     "PingFang SC" — if you only set the latin face to
//     "Microsoft YaHei", Chinese characters render with whatever the
//     system default CJK font happens to be (often ugly).
//
// Because the same authoring font name can have different stability
// on each platform, this module keeps a single source of truth —
// a `FontBridge` entry that names:
//   * `web`        — the CSS font-family fallback chain
//   * `pptx.latin` — the latin face to use in PPTX
//   * `pptx.eastAsia` — the East-Asian face to use in PPTX
//   * `pptx.complexScript` — the complex-script face
//
// Callers feed in a raw font name (from SVG `font-family` or from a
// SIF TextElement / TextRun) and the resolver picks the best bridge
// entry. If the input is already a full CSS fallback chain (e.g.
// `"PingFang SC", "Microsoft YaHei", sans-serif`) the resolver
// returns it unchanged for the web output and picks the first
// recognised face for PPTX. The default chain is CJK-first so a
// mixed Chinese/English slide renders correctly on every platform
// without any user configuration.

/**
 * A font bridge entry — the resolved representation of a font name
 * in both rendering targets (web / SVG / HTML preview and PPTX).
 */
export interface FontBridge {
  /** Human-readable label (used by editor UIs). */
  label: string
  /** CSS font-family fallback chain for the web / SVG / HTML preview. */
  web: string
  /**
   * Office-friendly font names. PowerPoint will use the `eastAsia`
   * face for CJK runs and the `latin` face for Latin runs, so
   * mixed-script text needs both set explicitly.
   */
  pptx: {
    latin: string
    eastAsia: string
    complexScript: string
  }
}

/**
 * A registry of named font presets keyed by an internal id (e.g.
 * `microsoftYaHei`). The default export is consumed by editor UIs
 * that need a stable, UI-friendly list of choices.
 */
export interface FontPreset {
  /** Stable id (kebab / camel, used in config). */
  id: string
  /** Human-readable label. */
  label: string
  /** Resolved bridge for the preset. */
  bridge: FontBridge
}

/**
 * A flat lookup table keyed by an authoring font name (any of:
 * English name `"Microsoft YaHei"`, Chinese name `"微软雅黑"`, CSS
 * alias `"SimHei"`, etc.). The resolver normalises the input and
 * walks this table first before falling back to heuristic matching.
 *
 * Why a flat table (not a tree of features): authoring font names
 * are arbitrary strings; we can't enumerate every possible input.
 * Keeping a small, opinionated lookup table gives the user explicit
 * control over the most common Chinese fonts and lets the resolver
 * fall back to a CJK-friendly default for everything else.
 */
export const FONT_BRIDGE: Record<string, FontBridge> = {
  // --- Sans-serif Chinese fonts (CJK default) -----------------------
  'Microsoft YaHei': {
    label: '微软雅黑 / Microsoft YaHei',
    web: '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  '微软雅黑': {
    label: '微软雅黑 / Microsoft YaHei',
    web: '"Microsoft YaHei", "微软雅黑", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  'PingFang SC': {
    label: '苹方 / PingFang SC',
    web: '"PingFang SC", "苹方-简", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  '苹方': {
    label: '苹方 / PingFang SC',
    web: '"PingFang SC", "苹方-简", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  'Noto Sans SC': {
    label: 'Noto Sans SC',
    web: '"Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  'Noto Sans CJK SC': {
    label: 'Noto Sans CJK SC',
    web: '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  'Source Han Sans SC': {
    label: '思源黑体 / Source Han Sans SC',
    web: '"Source Han Sans SC", "思源黑体", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  '思源黑体': {
    label: '思源黑体 / Source Han Sans SC',
    web: '"Source Han Sans SC", "思源黑体", "Noto Sans SC", "Microsoft YaHei", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },

  // --- Serif Chinese fonts ------------------------------------------
  'SimSun': {
    label: '宋体 / SimSun',
    web: '"SimSun", "宋体", "Source Han Serif SC", "Noto Serif SC", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },
  '宋体': {
    label: '宋体 / SimSun',
    web: '"SimSun", "宋体", "Source Han Serif SC", "Noto Serif SC", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },
  'SimHei': {
    label: '黑体 / SimHei',
    web: '"SimHei", "黑体", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'SimHei',
      complexScript: 'Arial'
    }
  },
  '黑体': {
    label: '黑体 / SimHei',
    web: '"SimHei", "黑体", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'SimHei',
      complexScript: 'Arial'
    }
  },
  'DengXian': {
    label: '等线 / DengXian',
    web: '"DengXian", "等线", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'DengXian',
      complexScript: 'Arial'
    }
  },
  '等线': {
    label: '等线 / DengXian',
    web: '"DengXian", "等线", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'DengXian',
      complexScript: 'Arial'
    }
  },
  'KaiTi': {
    label: '楷体 / KaiTi',
    web: '"KaiTi", "楷体", "STKaiti", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'KaiTi',
      complexScript: 'Times New Roman'
    }
  },
  '楷体': {
    label: '楷体 / KaiTi',
    web: '"KaiTi", "楷体", "STKaiti", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'KaiTi',
      complexScript: 'Times New Roman'
    }
  },
  'FangSong': {
    label: '仿宋 / FangSong',
    web: '"FangSong", "仿宋", "STFangsong", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'FangSong',
      complexScript: 'Times New Roman'
    }
  },
  '仿宋': {
    label: '仿宋 / FangSong',
    web: '"FangSong", "仿宋", "STFangsong", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'FangSong',
      complexScript: 'Times New Roman'
    }
  },
  'Source Han Serif SC': {
    label: '思源宋体 / Source Han Serif SC',
    web: '"Source Han Serif SC", "思源宋体", "Noto Serif SC", "SimSun", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },
  '思源宋体': {
    label: '思源宋体 / Source Han Serif SC',
    web: '"Source Han Serif SC", "思源宋体", "Noto Serif SC", "SimSun", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },

  // --- Common Latin / Western fonts --------------------------------
  Arial: {
    label: 'Arial',
    web: 'Arial, "Helvetica Neue", Helvetica, "Microsoft YaHei", "PingFang SC", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  Helvetica: {
    label: 'Helvetica',
    web: 'Helvetica, "Helvetica Neue", Arial, "Microsoft YaHei", sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  },
  'Times New Roman': {
    label: 'Times New Roman',
    web: '"Times New Roman", Times, "SimSun", "Source Han Serif SC", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },
  'Courier New': {
    label: 'Courier New',
    web: '"Courier New", Courier, monospace',
    pptx: {
      latin: 'Courier New',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Courier New'
    }
  },
  monospace: {
    label: 'monospace',
    web: 'monospace',
    pptx: {
      latin: 'Courier New',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Courier New'
    }
  },
  serif: {
    label: 'serif',
    web: '"Times New Roman", "SimSun", "Source Han Serif SC", serif',
    pptx: {
      latin: 'Times New Roman',
      eastAsia: 'SimSun',
      complexScript: 'Times New Roman'
    }
  },
  'sans-serif': {
    label: 'sans-serif',
    web: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif',
    pptx: {
      latin: 'Arial',
      eastAsia: 'Microsoft YaHei',
      complexScript: 'Arial'
    }
  }
}

/**
 * The default bridge. Used whenever the authoring input is empty,
 * unrecognised, or explicitly falls through. CJK-first by design.
 */
export const DEFAULT_FONT_BRIDGE: FontBridge = {
  label: '默认中英黑体',
  web: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Source Han Sans SC", Arial, sans-serif',
  pptx: {
    latin: 'Arial',
    eastAsia: 'Microsoft YaHei',
    complexScript: 'Arial'
  }
}

/**
 * Default font presets surfaced to editor UIs. Order is the order
 * they should appear in a dropdown — CJK-first, then Latin, then
 * monospace.
 */
export const DEFAULT_FONT_PRESETS: FontPreset[] = [
  {
    id: 'default',
    label: '默认中英黑体',
    bridge: DEFAULT_FONT_BRIDGE
  },
  {
    id: 'microsoftYaHei',
    label: '微软雅黑',
    bridge: FONT_BRIDGE['Microsoft YaHei']
  },
  {
    id: 'pingfang',
    label: '苹方 (降级到微软雅黑)',
    bridge: FONT_BRIDGE['PingFang SC']
  },
  {
    id: 'sourceHanSans',
    label: '思源黑体 (降级到微软雅黑)',
    bridge: FONT_BRIDGE['Source Han Sans SC']
  },
  {
    id: 'notoSansSC',
    label: 'Noto Sans SC (降级到微软雅黑)',
    bridge: FONT_BRIDGE['Noto Sans SC']
  },
  {
    id: 'simsun',
    label: '宋体',
    bridge: FONT_BRIDGE['SimSun']
  },
  {
    id: 'simhei',
    label: '黑体',
    bridge: FONT_BRIDGE['SimHei']
  },
  {
    id: 'kaiti',
    label: '楷体',
    bridge: FONT_BRIDGE['KaiTi']
  },
  {
    id: 'fangsong',
    label: '仿宋',
    bridge: FONT_BRIDGE['FangSong']
  },
  {
    id: 'dengxian',
    label: '等线',
    bridge: FONT_BRIDGE['DengXian']
  },
  {
    id: 'arial',
    label: 'Arial',
    bridge: FONT_BRIDGE['Arial']
  },
  {
    id: 'timesNewRoman',
    label: 'Times New Roman',
    bridge: FONT_BRIDGE['Times New Roman']
  }
]

/**
 * CJK / Han character range used to detect a run that should switch
 * to the East-Asian typeface. Anything outside this range falls back
 * to the latin face. We intentionally keep the range narrow (BMP
 * ideographs + extensions) so emoji / symbols aren't misclassified.
 */
const CJK_CHAR_REGEX = /[㐀-鿿豈-﫿가-힯]/

/**
 * Return true when the string contains at least one CJK character.
 * Used by the PPTX converter to decide whether the run needs the
 * `ea` typeface set (or whether `latin` alone is enough).
 */
export function containsCjk(text: string): boolean {
  if (!text) return false
  return CJK_CHAR_REGEX.test(text)
}

/**
 * Normalise an authoring font name. We:
 *   * trim surrounding whitespace
 *   * drop surrounding quotes (`"Microsoft YaHei"` → `Microsoft YaHei`)
 *   * collapse the case for lookup (table keys are mixed-case
 *     English / Chinese; we keep casing intact for the web output)
 *
 * The result is suitable for use as a key in `FONT_BRIDGE`. The
 * *first* face of a CSS fallback chain is what most authors mean
 * when they write `"PingFang SC", "Microsoft YaHei", sans-serif`,
 * so we extract the first comma-separated name and look it up.
 */
export function normaliseFontName(input: string | undefined | null): string {
  if (!input) return ''
  const trimmed = input.trim()
  if (!trimmed) return ''
  // Strip a single layer of surrounding double-quotes (the common
  // CSS quoting convention). Multi-quoting like `""PingFang SC""`
  // is malformed CSS and we don't try to handle it.
  const unquoted = trimmed.replace(/^"(.+)"$/, '$1')
  return unquoted.trim()
}

/**
 * Extract the first face of a CSS font-family chain. SVG attributes
 * typically carry a single name (`font-family="Microsoft YaHei"`) but
 * a styled SVG / HTML may use a full chain
 * (`font-family: "PingFang SC", "Microsoft YaHei", sans-serif`).
 * Returning the first face keeps the resolver simple — the
 * downstream CSS path keeps the full chain and the PPTX path picks
 * the first recognised face.
 */
export function firstFontFace(input: string | undefined | null): string {
  if (!input) return ''
  const first = input.split(',')[0] ?? ''
  return normaliseFontName(first)
}

/**
 * Resolve an authoring font name to a {@link FontBridge}.
 *
 * Strategy:
 *   1. Pull the first face out of the input.
 *   2. Try the bridge table directly (handles exact matches:
 *      `"Microsoft YaHei"`, `"微软雅黑"`, `"PingFang SC"`, ...).
 *   3. Try case-insensitive matching (handles `"microsoft yahei"`).
 *   4. Heuristically detect serif vs sans-serif on a generic
 *      family (`serif`, `sans-serif`, `monospace`).
 *   5. Fall back to the CJK-first default.
 *
 * The function is total: it never throws and never returns null.
 * Empty input resolves to the CJK-first default.
 */
export function resolveFontBridge(input: string | undefined | null): FontBridge {
  const face = firstFontFace(input)
  if (!face) return DEFAULT_FONT_BRIDGE

  const direct = FONT_BRIDGE[face]
  if (direct) return direct

  // Case-insensitive fallback. We can't lowercase Chinese names
  // safely (they have no case to fold) so we only do this for
  // ASCII faces; the direct lookup above already caught the
  // canonical casing for the Chinese keys.
  if (/^[\x00-\x7F]+$/.test(face)) {
    const lowered = face.toLowerCase()
    for (const key of Object.keys(FONT_BRIDGE)) {
      if (key.toLowerCase() === lowered) {
        return FONT_BRIDGE[key]!
      }
    }
  }

  // Generic-family / unknown — fall through to default.
  return DEFAULT_FONT_BRIDGE
}

/**
 * Resolve a font name to a PPTX-friendly single `fontFace` string.
 *
 * pptxgenjs's `fontFace` option is a single string; it doesn't
 * expose the `<a:latin>` / `<a:ea>` split. The pragmatic
 * workaround used here is to pick the `eastAsia` face whenever
 * the resolved bridge has a CJK-specific name (so the CJK glyphs
 * are correct) and otherwise fall back to the `latin` face.
 *
 * For mixed-script runs the caller is expected to look at the
 * run text and call {@link pickPptxFontForText} instead.
 */
export function resolvePptxFontFace(input: string | undefined | null): string {
  const bridge = resolveFontBridge(input)
  return bridge.pptx.eastAsia
}

/**
 * Pick the most appropriate PPTX face for a specific run. When the
 * run text contains CJK characters we prefer `eastAsia`; otherwise
 * `latin`. This is the helper the PPTX converter should call per
 * run so a mixed `"Hello 你好"` text frame doesn't lose CJK
 * fidelity to whatever the system default CJK font happens to be.
 */
export function pickPptxFontForText(input: string | undefined | null, text: string): string {
  const bridge = resolveFontBridge(input)
  return containsCjk(text) ? bridge.pptx.eastAsia : bridge.pptx.latin
}

/**
 * Resolve a font name to a CSS font-family string. Returns a
 * full fallback chain (always quoted where the original name
 * contained spaces) so the browser / SVG renderer can pick the
 * first face it actually has installed.
 */
export function resolveWebFontFamily(input: string | undefined | null): string {
  const bridge = resolveFontBridge(input)
  return bridge.web
}

/**
 * Resolve a font name to the East-Asian face used by PPTX. Useful
 * for callers that want to set `fontFace` to the East-Asian name
 * even for purely Latin text, which is a common cross-platform
 * safety measure.
 */
export function resolvePptxEastAsiaFont(input: string | undefined | null): string {
  return resolveFontBridge(input).pptx.eastAsia
}

/**
 * Resolve a font name to the Latin face used by PPTX. Useful when
 * the caller is certain the run is pure Latin (no CJK) and wants
 * the Latin face explicitly.
 */
export function resolvePptxLatinFont(input: string | undefined | null): string {
  return resolveFontBridge(input).pptx.latin
}

// PPTX post-processor — patches slide XMLs to inject attributes
// that pptxgenjs's high-level API doesn't expose. Used to support
// SVG features that PowerPoint natively renders but pptxgenjs's
// shape primitives do not, namely:
//
//   1. SVG `stroke-linecap` (`butt` | `round` | `square`)
//      → PPTX `<a:ln ... cap="rnd|sq"/>`.
//
//   2. SVG `stroke-linejoin` (`miter` | `round` | `bevel`)
//      → PPTX `<a:ln><a:round/></a:ln>` (round) or
//      `<a:ln><a:bevel/></a:ln>` (bevel) or no join element
//      (miter, the DrawingML default).
//
//   3. SVG `fill-rule="evenodd"` on `<path>` and other shapes
//      that go through `<a:custGeom>`
//      → PPTX `<a:custGeom ... fillRule="evenOdd">`.
//
// Why post-process at all? pptxgenjs (1) writes a hardcoded
// `<a:ln>` element with no `cap`/join support, (2) writes a
// hardcoded `<a:custGeom>` element with no `fillRule` attribute.
// We can't fix that in the API call, so we patch the resulting
// XML. The SIF→PPTX converter (see generator.ts) collects the
// per-element hints as it walks the document; this module
// applies them to the corresponding `<a:ln>` and `<a:custGeom>`
// nodes in slide order.

import JSZip from 'jszip'

/**
 * Per-element hint for the post-processor. Hints are matched to
 * the corresponding XML node by the element's position in the
 * slide's render order (the same order pptxgenjs uses to emit
 * them).
 */
export interface PptxPostProcessHint {
  /** PPTX `<a:ln>` cap value to apply. */
  cap?: 'flat' | 'rnd' | 'sq'
  /** PPTX `<a:ln>` join to apply. */
  join?: 'round' | 'bevel' | 'miter'
  /** CustGeom `fillRule` attribute to apply. */
  fillRule?: 'nonzero' | 'evenOdd'
}

/**
 * A list of hints — one per element that needs patching, in the
 * same order the elements were added to the slide. Elements that
 * don't need any post-processing are represented as `null`.
 */
export type PptxPostProcessHints = Array<PptxPostProcessHint | null>

/**
 * Per-slide post-process hints, split by XML block kind. The
 * post-processor walks `<a:ln>` and `<a:custGeom>` blocks in
 * document order; the two counters are independent because a
 * single shape may emit zero, one, or both kinds (e.g. an
 * unstroked custom path emits only `<a:custGeom>`, a stroked
 * rect emits only `<a:ln>`, a stroked custom path emits both).
 * Merging them into a single array would misalign hints.
 */
export interface PptxPostProcessSlideHints {
  lineHints: PptxPostProcessHints
  geomHints: PptxPostProcessHints
}

/**
 * Apply a list of post-process hints to a .pptx buffer.
 *
 * The function opens the buffer as a zip, finds each slide XML
 * (`ppt/slides/slide*.xml`), and walks the XML looking for
 * `<a:ln>` and `<a:custGeom>` elements in document order. For
 * each one, the next hint is consumed and applied:
 *
 *   - `<a:ln>`: if the hint has `cap` and/or `join`, the line's
 *     attributes are updated and (for `join`) a child element
 *     (`<a:round/>` or `<a:bevel/>`) is inserted before the
 *     closing tag.
 *
 *   - `<a:custGeom>`: if the hint has `fillRule`, the
 *     `fillRule` attribute is set on the custGeom element.
 *
 * Slide XMLs we don't have hints for are passed through
 * untouched. Hints are consumed greedily — we patch the N-th
 * `<a:ln>`/`<a:custGeom>` with the N-th hint that targets that
 * node kind, not with the N-th hint overall. This way shapes
 * without a `line` (e.g. text with no border) don't burn a
 * `cap`/`join` slot.
 */
export async function postProcessPptxBuffer(
  buffer: Uint8Array,
  hintsPerSlide: PptxPostProcessSlideHints[]
): Promise<Uint8Array> {
  if (hintsPerSlide.length === 0) {
    return buffer
  }

  const zip = await JSZip.loadAsync(buffer)
  const slidePaths = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      const bi = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      return ai - bi
    })

  for (let slideIdx = 0; slideIdx < slidePaths.length; slideIdx++) {
    const slidePath = slidePaths[slideIdx]
    const hints = hintsPerSlide[slideIdx]
    if (!hints) continue
    if (hints.lineHints.length === 0 && hints.geomHints.length === 0) continue

    const file = zip.file(slidePath)
    if (!file) continue

    const xml = await file.async('string')
    const patched = patchSlideXml(xml, hints.lineHints, hints.geomHints)
    if (patched !== xml) {
      zip.file(slidePath, patched)
    }
  }

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/**
 * Walk a single slide's XML and apply the per-element hints.
 *
 * The XML emitted by pptxgenjs is hand-formatted — every tag is
 * on its own line — so a simple line-based scanner is enough
 * to find `<a:ln>` and `<a:custGeom>` opening tags. We don't
 * need a full XML parser: the relevant substrings are unique
 * and well-formed.
 *
 * `lineIdx` / `geomIdx` track the position within the current
 * slide. They're independent so a shape with both a custGeom
 * and a line (e.g. a path with a stroke) advances both
 * counters; a shape with neither (e.g. plain text) advances
 * neither.
 *
 * The strategy is:
 *   1. Split the XML into "<a:ln>...</a:ln>" blocks and
 *      "everything else" blocks. For each line block, consume
 *      one line-hint and rewrite the opening tag (and inject
 *      the join child) before re-emitting the block.
 *   2. For each "<a:custGeom>...</a:custGeom>" block, consume
 *      one geom-hint and rewrite the opening tag.
 */
function patchSlideXml(
  xml: string,
  lineHints: PptxPostProcessHints,
  geomHints: PptxPostProcessHints
): string {
  const blocks = splitIntoBlocks(xml)
  if (blocks.length === 0) return xml

  let lineIdx = 0
  let geomIdx = 0
  const out: string[] = []

  for (const block of blocks) {
    if (block.kind === 'line') {
      const hint = lineHints[lineIdx] ?? null
      lineIdx++
      if (hint && (hint.cap || hint.join)) {
        out.push(replaceLineBlock(block.text, hint))
      } else {
        out.push(block.text)
      }
    } else if (block.kind === 'geom') {
      const hint = geomHints[geomIdx] ?? null
      geomIdx++
      if (hint && hint.fillRule) {
        out.push(replaceCustGeomBlock(block.text, hint.fillRule))
      } else {
        out.push(block.text)
      }
    } else {
      out.push(block.text)
    }
  }

  return out.join('')
}

interface SlideXmlBlock {
  kind: 'line' | 'geom' | 'text'
  text: string
}

/**
 * Split the slide XML into a sequence of blocks: each `<a:ln>...
 * </a:ln>` pair and each `<a:custGeom>...</a:custGeom>` pair
 * becomes its own block; the surrounding text is split into
 * "passthrough" text blocks. This is a regex-based splitter
 * rather than a full parser — pptxgenjs's output is regular
 * enough (each `<a:ln>` and `<a:custGeom>` element is on its
 * own line(s), with a matching close tag) that we can get
 * away with finding the tag pair's span.
 */
function splitIntoBlocks(xml: string): SlideXmlBlock[] {
  const blocks: SlideXmlBlock[] = []
  // Match `<a:ln ...>...</a:ln>` or `<a:ln .../>` (the latter
  // is defensive — pptxgenjs always emits a child fill — but
  // we handle it for robustness).
  const linePattern = /<a:ln(?:\s[^>]*)?>[\s\S]*?<\/a:ln>|<a:ln(?:\s[^>]*)?\/>/g
  const geomPattern = /<a:custGeom(?:\s[^>]*)?>[\s\S]*?<\/a:custGeom>|<a:custGeom(?:\s[^>]*)?\/>/g

  // Find all matching spans; merge with the gaps.
  const spans: Array<{ start: number; end: number; kind: 'line' | 'geom' }> = []
  for (const m of xml.matchAll(linePattern)) {
    spans.push({ start: m.index!, end: m.index! + m[0].length, kind: 'line' })
  }
  for (const m of xml.matchAll(geomPattern)) {
    spans.push({ start: m.index!, end: m.index! + m[0].length, kind: 'geom' })
  }
  spans.sort((a, b) => a.start - b.start)

  if (spans.length === 0) return []

  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) {
      blocks.push({ kind: 'text', text: xml.slice(cursor, span.start) })
    }
    blocks.push({ kind: span.kind, text: xml.slice(span.start, span.end) })
    cursor = span.end
  }
  if (cursor < xml.length) {
    blocks.push({ kind: 'text', text: xml.slice(cursor) })
  }

  return blocks
}

/**
 * Replace / insert the `cap` attribute on an `<a:ln>` block's
 * opening tag, and inject the appropriate join child element
 * (if any) before the closing tag.
 */
function replaceLineBlock(block: string, hint: PptxPostProcessHint): string {
  // Update the opening tag attributes.
  let out = block.replace(/(<a:ln)(?:\s[^>]*)?>/, (_match, prefix) => {
    // Strip any existing cap attribute first.
    let attrs = ''
    const existing = block.match(/<a:ln(\s[^>]*)?>/)
    if (existing && existing[1]) {
      attrs = existing[1].replace(/\s+cap="[^"]*"/g, '')
    }
    if (hint.cap) {
      attrs = ` cap="${hint.cap}"${attrs}`
    }
    return `${prefix}${attrs}>`
  })

  if (hint.join) {
    const child = joinChildElement(hint.join)
    if (child) {
      // Insert the join child just before the closing </a:ln>.
      // The placement (before or after `<a:prstDash>`) doesn't
      // matter for DrawingML semantics, so we just stick it in
      // right before the close tag.
      out = out.replace(/<\/a:ln>$/, `${child}</a:ln>`)
    }
  }

  return out
}

/**
 * Return the child element to insert for the requested join.
 * `round` → `<a:round/>`, `bevel` → `<a:bevel/>`,
 * `miter` → no element (DrawingML default; the absence of
 * `<a:round/>` / `<a:bevel/>` means the line uses the miter
 * default).
 */
function joinChildElement(join: 'round' | 'bevel' | 'miter'): string {
  if (join === 'round') return '<a:round/>'
  if (join === 'bevel') return '<a:bevel/>'
  return ''
}

/**
 * Replace / insert the `fillRule` attribute on an `<a:custGeom>`
 * block's opening tag. DrawingML accepts `nonzero` and
 * `evenOdd` (case-sensitive camelCase).
 */
function replaceCustGeomBlock(block: string, fillRule: 'nonzero' | 'evenOdd'): string {
  return block.replace(/(<a:custGeom)(?:\s[^>]*)?>/, (_match, prefix) => {
    let attrs = ''
    const existing = block.match(/<a:custGeom(\s[^>]*)?>/)
    if (existing && existing[1]) {
      attrs = existing[1].replace(/\s+fillRule="[^"]*"/g, '')
    }
    attrs = ` fillRule="${fillRule}"${attrs}`
    return `${prefix}${attrs}>`
  })
}

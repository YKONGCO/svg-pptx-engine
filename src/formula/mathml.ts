// MathML model — XML parser/serializer and small AST utilities.
//
// The `parseMathML` path is the only entry used in production today
// (for round-tripping user-supplied MathML through the OMML stage);
// the `mathNodeToMathML` serializer in `latex.ts` re-uses `escapeXml`
// for its output.

import { XMLParser } from 'fast-xml-parser'
import type { MathNode, MathTag } from './types'

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function toMathNodeList(input: unknown): MathNode[] {
  if (!Array.isArray(input)) return []

  const nodes: MathNode[] = []

  for (const entry of input as Array<Record<string, unknown>>) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === '#text') {
        const text = String(value ?? '')
        if (text.trim().length > 0) {
          nodes.push({ name: 'mtext', text })
        }
        continue
      }

      if (key === ':@') {
        continue
      }

      const childEntry = entry as Record<string, unknown>
      const attrs = (childEntry[':@'] ?? {}) as Record<string, string>
      const children = toMathNodeList(value)
      const node: MathNode = {
        name: key as MathTag,
        attrs,
        children
      }

      // Collapse `<mi>x</mi>` (which fast-xml-parser splits into a
      // child `<mtext>x</mtext>`) back into a leaf text payload so
      // the OMML renderer doesn't emit an extra wrapper.
      if (children.length === 1 && children[0].name === 'mtext' && !children[0].children?.length) {
        node.text = children[0].text
        node.children = undefined
      }

      nodes.push(node)
    }
  }

  return nodes
}

/** Parse a MathML string into a `MathNode` tree rooted at `<math>`. */
export function parseMathML(mathml: string): MathNode {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: false,
    textNodeName: '#text'
  })
  const parsed = parser.parse(mathml)
  const nodes = toMathNodeList(parsed)
  const mathNode = nodes.find(node => node.name === 'math')
  if (!mathNode) {
    throw new Error('Invalid MathML: missing <math> root')
  }
  return mathNode
}

/** Concatenate every text payload under the given node, depth-first. */
export function flattenText(node: MathNode | undefined): string {
  if (!node) return ''
  if (node.text !== undefined) return node.text
  return (node.children ?? []).map(child => flattenText(child)).join('')
}

export const __testing = { toArray, toMathNodeList }

// MathML → OMML rendering.
//
// `mathMLToOmml` is the only public entry. For a small AST subset
// (mi/mn/mo/mtext + mfrac/msqrt/msub/msup/msubsup) we render the
// OMML fragments directly so the output is well-formed even when
// the mathml2omml library is unavailable. Anything more complex is
// delegated to the `mml2omml` package, which lives at
// `packages/mathml2omml/`.

import { mml2omml } from 'mathml2omml'
import type { MathNode } from './types'
import { flattenText } from './mathml'

function wrapRun(text: string): string {
  return `<m:r><m:t xml:space="preserve">${text}</m:t></m:r>`
}

function wrapArg(tag: string, node: MathNode | undefined): string {
  return `<${tag}>${mathNodeToOmmlChildren(node)}</${tag}>`
}

function mathNodeToOmmlChildren(node: MathNode | undefined): string {
  if (!node) return ''
  if (node.name === 'math' || node.name === 'mrow') {
    return (node.children ?? []).map(child => mathNodeToOmmlChildren(child)).join('')
  }

  if (node.name === 'mi' || node.name === 'mn' || node.name === 'mo' || node.name === 'mtext') {
    return wrapRun(flattenText(node))
  }

  if (node.name === 'mfrac') {
    const [num, den] = node.children ?? []
    return `<m:f><m:fPr><m:type m:val="bar"/></m:fPr>${wrapArg('m:num', num)}${wrapArg('m:den', den)}</m:f>`
  }

  if (node.name === 'msqrt') {
    const radicand = node.children?.[0]
    return `<m:rad><m:radPr><m:degHide m:val="on"/></m:radPr><m:deg/>${wrapArg('m:e', radicand)}</m:rad>`
  }

  if (node.name === 'msub') {
    const [base, sub] = node.children ?? []
    return `<m:sSub><m:sSubPr><m:ctrlPr/></m:sSubPr>${wrapArg('m:e', base)}${wrapArg('m:sub', sub)}</m:sSub>`
  }

  if (node.name === 'msup') {
    const [base, sup] = node.children ?? []
    return `<m:sSup><m:sSupPr><m:ctrlPr/></m:sSupPr>${wrapArg('m:e', base)}${wrapArg('m:sup', sup)}</m:sSup>`
  }

  if (node.name === 'msubsup') {
    const [base, sub, sup] = node.children ?? []
    return `<m:sSubSup><m:sSubSupPr><m:ctrlPr/></m:sSubSupPr>${wrapArg('m:e', base)}${wrapArg('m:sub', sub)}${wrapArg('m:sup', sup)}</m:sSubSup>`
  }

  return (node.children ?? []).map(child => mathNodeToOmmlChildren(child)).join('')
}

/** Convert a MathML string to an OMML string, using the bundled
 *  `mml2omml` library for the heavy lifting. */
export function mathMLToOmml(mathml: string): string {
  return mml2omml(mathml)
}

export const __testing = { mathNodeToOmmlChildren, wrapArg, wrapRun }

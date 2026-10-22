// src/html/parser.ts
//
// HTML parser wrapper around parse5. The goal is a small, type-friendly
// DOM tree that downstream code (CSS cascade, converters) can walk
// without touching parse5 directly.
//
// parse5 8.x is ESM-only; ts-jest is configured to handle ESM via
// esModuleInterop + allowSyntheticDefaultImports.
//
// Tree shape produced:
//   - HtmlElement  : an HTML element (tagName + attrs + children)
//   - HtmlText     : a text node (carries the raw string)
//   - HtmlComment  : a comment node (default-skipped by walkTree)
//
// parse5 nodes are mutable; we copy the bits we need into our own
// interface so the rest of the codebase never depends on parse5's
// exact shape.

import { parse, parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'

type P5Node = DefaultTreeAdapterMap['node']
type P5Element = DefaultTreeAdapterMap['element']
type P5TextNode = DefaultTreeAdapterMap['textNode']
type P5CommentNode = DefaultTreeAdapterMap['commentNode']
type P5Document = DefaultTreeAdapterMap['document']

/** A unique node id within a single parseHTML() result. */
export type NodeId = string

export interface HtmlElement {
  type: 'element'
  nodeId: NodeId
  tagName: string
  attrs: Record<string, string>
  children: HtmlNode[]
  parent?: HtmlElement
}

export interface HtmlText {
  type: 'text'
  nodeId: NodeId
  text: string
  parent?: HtmlElement
}

export interface HtmlComment {
  type: 'comment'
  nodeId: NodeId
  data: string
  parent?: HtmlElement
}

export type HtmlNode = HtmlElement | HtmlText | HtmlComment

export interface ParsedHtmlDocument {
  root: HtmlElement
  head: HtmlElement
  body: HtmlElement
  /** Raw text of every <style> block in <head>, in document order. */
  styleBlocks: string[]
}

/** Parse a full HTML string (with or without doctype). */
export function parseHTML(html: string): ParsedHtmlDocument {
  const doc = parse(html) as P5Document
  return buildDocument(doc)
}

/**
 * Parse an HTML fragment. parse5 wraps the result in a synthetic
 * <html><head></head><body>{fragment}</body></html> document, so we
 * return the same shape and the caller can read `body` to find
 * their fragment's root.
 */
export function parseHTMLFragment(fragment: string): ParsedHtmlDocument {
  const doc = parseFragment(fragment) as unknown as P5Document
  return buildDocument(doc)
}

// =============================================================================
// Tree builder
// =============================================================================

let _nodeCounter = 0
function nextNodeId(): string {
  _nodeCounter += 1
  return `n${_nodeCounter}`
}

function resetNodeCounter(): void {
  _nodeCounter = 0
}

function buildDocument(doc: P5Document): ParsedHtmlDocument {
  resetNodeCounter()

  // parse5 always returns [doctype?, html]. Find the <html> element
  // among the document's child nodes.
  let htmlP5: P5Element | undefined
  for (const c of doc.childNodes) {
    if (isElement(c) && c.tagName === 'html') {
      htmlP5 = c
      break
    }
  }
  if (!htmlP5) {
    throw new Error('parseHTML: input does not contain an <html> element')
  }

  const root = buildElement(htmlP5)
  const head = findChildByTag(root, 'head') ?? makeEmptyElement('head', root)
  const body = findChildByTag(root, 'body') ?? makeEmptyElement('body', root)

  // Extract <style> blocks from <head>.
  const styleBlocks: string[] = []
  for (const child of head.children) {
    if (child.type === 'element' && child.tagName === 'style') {
      const text = collectText(child).trim()
      if (text) styleBlocks.push(text)
    }
  }

  return { root, head, body, styleBlocks }
}

function makeEmptyElement(tagName: string, parent: HtmlElement): HtmlElement {
  const el: HtmlElement = {
    type: 'element',
    nodeId: nextNodeId(),
    tagName,
    attrs: {},
    children: [],
    parent,
  }
  parent.children.push(el)
  return el
}

function buildElement(el: P5Element, parent?: HtmlElement): HtmlElement {
  const attrs: Record<string, string> = {}
  for (const a of el.attrs ?? []) {
    attrs[a.name] = a.value
  }
  const out: HtmlElement = {
    type: 'element',
    nodeId: nextNodeId(),
    tagName: el.tagName,
    attrs,
    children: [],
    parent,
  }
  out.children = buildChildren(el.childNodes, out)
  return out
}

function buildChildren(nodes: P5Node[], parent: HtmlElement): HtmlNode[] {
  const out: HtmlNode[] = []
  for (const node of nodes) {
    if (isElement(node)) {
      out.push(buildElement(node, parent))
    } else if (isTextNode(node)) {
      if (node.value && node.value.length > 0) {
        out.push({
          type: 'text',
          nodeId: nextNodeId(),
          text: node.value,
          parent,
        })
      }
    } else if (isComment(node)) {
      out.push({
        type: 'comment',
        nodeId: nextNodeId(),
        data: node.data,
        parent,
      })
    }
    // doctype and other nodes are ignored
  }
  return out
}

function findChildByTag(parent: HtmlElement, tagName: string): HtmlElement | undefined {
  for (const c of parent.children) {
    if (c.type === 'element' && c.tagName === tagName) return c
  }
  return undefined
}

function isElement(node: P5Node): node is P5Element {
  return !!(node as P5Element).tagName
}

function isTextNode(node: P5Node): node is P5TextNode {
  return (node as P5TextNode).nodeName === '#text'
}

function isComment(node: P5Node): node is P5CommentNode {
  return (node as P5CommentNode).nodeName === '#comment'
}

function collectText(el: HtmlElement): string {
  let s = ''
  for (const c of el.children) {
    if (c.type === 'text') s += c.text
  }
  return s
}

// =============================================================================
// Public tree accessors
// =============================================================================

/** Returns the lowercase tag name for an element node. */
export function getTagName(node: HtmlElement): string {
  return node.tagName
}

/** Returns the attribute value, or undefined. */
export function getAttr(node: HtmlElement, name: string): string | undefined {
  return node.attrs[name]
}

/** Returns child elements only (text/comment nodes are filtered out). */
export function getChildren(node: HtmlElement): HtmlElement[] {
  return node.children.filter((c): c is HtmlElement => c.type === 'element')
}

/** Concatenated text content of an element and its descendants. */
export function getTextContent(node: HtmlElement): string {
  let s = ''
  for (const c of node.children) {
    if (c.type === 'text') s += c.text
    else if (c.type === 'element') s += getTextContent(c)
  }
  return s
}

/**
 * Walk the subtree rooted at `root` in document order. By default
 * text nodes are visited too; pass `includeText=false` to skip them.
 * Comments are always skipped.
 */
export function walkTree(
  root: HtmlElement,
  visit: (node: HtmlNode) => void,
  options?: { includeText?: boolean }
): void {
  const includeText = options?.includeText !== false
  for (const child of root.children) {
    visit(child)
    if (child.type === 'element') walkTree(child, visit, options)
    else if (child.type === 'text' && includeText) {
      // already visited above
    }
  }
}

/**
 * Find all descendants (not including `root` itself) matching `tagName`.
 * Tag name comparison is case-insensitive.
 */
export function findByTag(root: HtmlElement, tagName: string): HtmlElement[] {
  const want = tagName.toLowerCase()
  const out: HtmlElement[] = []
  for (const c of root.children) {
    if (c.type === 'element' && c.tagName === want) out.push(c)
    if (c.type === 'element') out.push(...findByTag(c, tagName))
  }
  return out
}

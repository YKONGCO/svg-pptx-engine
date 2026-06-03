// Protocol version management
//
// 1.0.x — initial release
// 1.1.0 — adds LayoutDirective, IconElement, optional BaseElement fields
//         (layout, intrinsicWidth, intrinsicHeight, clipPathId,
//         patternFillId, maskId). New SIF fields are all optional and
//         backward compatible.

export const PROTOCOL_VERSION = '1.1.0'

export interface ProtocolInfo {
  version: string
  name: string
  description: string
}

export const PROTOCOL_INFO: ProtocolInfo = {
  version: PROTOCOL_VERSION,
  name: 'sif',
  description: 'Slide Intermediate Format - A flexible format for representing slide content'
}

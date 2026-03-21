// Protocol version management

export const PROTOCOL_VERSION = '1.0.0'

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

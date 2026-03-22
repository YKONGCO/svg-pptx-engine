declare module 'mathml2omml' {
  export interface MML2OMMLOptions {
    disableDecode?: boolean
  }

  export function mml2omml(mmlString: string, options?: MML2OMMLOptions): string
}

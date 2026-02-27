declare module 'qrcode.react' {
  import type { CSSProperties } from 'react'

  export interface QRCodeSVGProps {
    value: string
    size?: number
    bgColor?: string
    fgColor?: string
    level?: 'L' | 'M' | 'Q' | 'H'
    includeMargin?: boolean
    className?: string
    style?: CSSProperties
    title?: string
  }

  export const QRCodeSVG: (props: QRCodeSVGProps) => JSX.Element
}

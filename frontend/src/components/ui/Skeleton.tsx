import type { CSSProperties } from 'react'

interface SkeletonProps {
  height?: number
  width?: string | number
}

export const Skeleton = ({ height = 16, width = '100%' }: SkeletonProps) => {
  const style: CSSProperties = { height, width }
  return <div className="ui-skeleton" style={style} aria-hidden="true" />
}

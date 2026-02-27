import { colors } from './colors'
import { typography } from './typography'
import { spacing } from './spacing'
import { states } from './states'

export const theme = {
  colors,
  typography,
  spacing,
  states,
} as const

export { colors, typography, spacing, states }

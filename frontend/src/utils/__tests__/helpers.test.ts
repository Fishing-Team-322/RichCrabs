import { formatTime, getTeamColor } from '../helpers'

describe('helpers', () => {
  it('formats seconds to mm:ss', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(125)).toBe('2:05')
  })

  it('returns team color by side', () => {
    expect(getTeamColor('A')).toBe('#ff6b6b')
    expect(getTeamColor('B')).toBe('#6b9fff')
  })
})

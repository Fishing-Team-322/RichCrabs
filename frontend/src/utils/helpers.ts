export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const getTeamColor = (team: 'A' | 'B'): string => {
  return team === 'A' ? '#ff6b6b' : '#6b9fff'
}
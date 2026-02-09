export function statusEmoji(status){
  const s = (status||'').toUpperCase()
  if (s === 'DELIVERED') return '🟩'
  if (s === 'NOT_DELIVERED') return '🟥'
  return '⬜'
}
export function statusLabel(status){
  const s = (status||'').toUpperCase()
  if (s === 'DELIVERED') return 'Entregado'
  if (s === 'NOT_DELIVERED') return 'Fallido'
  return 'Pendiente'
}
export function effColor(eff){ // eff 0..1
  const pct = Math.round((eff||0)*100)
  if (pct >= 90) return 'green'
  if (pct >= 70) return 'yellow'
  return 'red'
}

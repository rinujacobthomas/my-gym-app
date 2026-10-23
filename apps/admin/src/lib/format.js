const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const inr = p => ((Number(p) || 0) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })

export const hhmm = min => {
  min = Math.min(1440, Math.max(0, Math.round(Number(min) || 0)))
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0')
}

export const minFromHHMM = s => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim())
  if (!m || +m[1] > 24 || +m[2] > 59) return 0
  return Math.min(1440, +m[1] * 60 + +m[2])
}

export const fmtDate = ts => {
  if (!ts) return '—'
  // @db.Date columns arrive as midnight UTC; read them as that calendar day, not as an instant.
  const d = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(String(ts)) ? new Date(String(ts).slice(0, 10) + 'T12:00:00') : new Date(ts)
  if (isNaN(+d)) return '—'
  return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2)
}

export const fmtDateTime = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(+d)) return '—'
  return fmtDate(d) + ', ' + hhmm(d.getHours() * 60 + d.getMinutes())
}

export const ymLabel = ym => {
  const [y, m] = String(ym || '').split('-')
  if (!m) return String(ym || '')
  return MON[+m - 1] + ' ' + String(y).slice(2)
}

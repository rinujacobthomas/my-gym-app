// Finished-session upload: the relational WorkoutLog table is the source of truth for
// history/analytics. Idempotent by client UUID; offline logs wait here and flush on boot.
export function syncWorkoutLog(w) {
  const payload = {
    id: w.id, date: w.d,
    startedAt: w.start ? new Date(w.start).toISOString() : null,
    endedAt: new Date(w.end || Date.now()).toISOString(),
    routineName: w.name || null,
    totalVolume: w.vol || 0,
    prCount: (w.prs || []).length,
    offSite: !!w.offSite,
    entries: (w.entries || []).map(e => ({ id: e.id, sets: e.sets, topW: e.topW || null })),
  }
  try {
    const q = JSON.parse(localStorage.getItem('og_wlog_queue') || '[]')
    q.push(payload)
    localStorage.setItem('og_wlog_queue', JSON.stringify(q.slice(-50)))
  } catch { /* */ }
  flushWorkoutQueue()
}

export function flushWorkoutQueue() {
  let q = []
  try { q = JSON.parse(localStorage.getItem('og_wlog_queue') || '[]') } catch { return }
  if (!q.length) return
  Promise.allSettled(q.map(p => fetch('/api/workouts', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  }).then(r => { if (!r.ok && r.status !== 409) throw new Error('http ' + r.status) }))).then(results => {
    const remaining = q.filter((_p, i) => results[i].status === 'rejected')
    localStorage.setItem('og_wlog_queue', JSON.stringify(remaining))
  }).catch(() => {})
}

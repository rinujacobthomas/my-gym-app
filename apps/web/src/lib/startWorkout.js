// One decision shared by the mobile tab bar and the desktop sidebar: resuming beats
// restarting — an active session goes straight back to its timer, otherwise today's
// planned routine opens in the start flow.
import { effectiveRoutine } from './history.js'
import { todayISO } from './format.js'

export function startWorkout(S, { onStart, nav }) {
  if (!S.active) {
    const r = effectiveRoutine(S, todayISO())
    if (r && r.ex.length) { onStart(r.id); return }
  }
  nav('/workout')
}

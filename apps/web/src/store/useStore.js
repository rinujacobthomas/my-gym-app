import { create } from 'zustand'
import { api, putState, getState, logout as apiLogout, logoutAll as apiLogoutAll, setAuthHandlers } from '@og/api-client'
import { localTZ } from '../lib/format.js'
import { registerCustom } from '../lib/exercises.js'
import { flushWorkoutQueue } from '../lib/wlog.js'

const KEY = 'gym_state_v1'
export const DEF = {
  unit: 'kg', restSec: 90, sound: true, keepAwake: true, lang: 'en',
  theme: 'dark', accent: 'red', body: 'male', targetW: null,
  bodyweight: [], routines: [], week: {}, dayPlan: {},
  exWeights: {}, workouts: [], active: null, customEx: [], gifSize: 'full',
  reminder: { on: false, time: '08:00', tz: null }, effort: null
}
const clone = o => JSON.parse(JSON.stringify(o))

function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = Object.assign(clone(DEF), JSON.parse(raw))
      if (s.accent === 'lime') s.accent = 'red'
      return s
    }
  } catch (e) { /* ignore */ }
  return clone(DEF)
}

const hasData = st => !!((st.workouts || []).length || (st.routines || []).length || (st.bodyweight || []).length)

export const useStore = create((set, get) => {
  let pushTm = null

  const persist = (S, push = true) => {
    S._ts = Date.now()
    registerCustom(S.customEx)
    localStorage.setItem(KEY, JSON.stringify(S))
    set({ S })
    if (push && get().user) {
      clearTimeout(pushTm)
      pushTm = setTimeout(() => get().pushState(), 1500)
    }
  }

  // A setting changed right before switching away/closing the tab must not get lost mid-debounce.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (pushTm) {
      clearTimeout(pushTm)
      pushTm = null
      get().pushState()
    }
  })

  // Everything a sign-out leaves behind on this device, whichever way it was triggered.
  const clearLocalSession = () => {
    get().setUser(null)
    localStorage.removeItem('gym_dirty')
    localStorage.removeItem(KEY)
    persist(clone(DEF), false)
  }

  // A 401 from anywhere means our session died — land on a clean logged-out app exactly once.
  setAuthHandlers({
    unauthorized: () => { if (get().user) clearLocalSession() },
  })

  return {
    S: (() => { const s = loadState(); registerCustom(s.customEx); return s })(),
    user: (() => { try { return JSON.parse(localStorage.getItem('gym_user')) || null } catch { return null } })(),
    ready: false,

    update(mut, push = true) {
      const S = clone(get().S)
      mut(S)
      persist(S, push)
    },
    replaceState(S, push = false) { persist(clone(S), push) },

    setUser(u) {
      if (u) localStorage.setItem('gym_user', JSON.stringify(u))
      else localStorage.removeItem('gym_user')
      set({ user: u })
    },

    async pushState() {
      if (!get().user) return
      clearTimeout(pushTm)
      try { await putState(get().S); localStorage.removeItem('gym_dirty') }
      catch (e) { if (e.status !== 401) localStorage.setItem('gym_dirty', '1') }
    },
    async pullState() {
      try {
        const { state } = await getState()
        const S = get().S
        const dirty = localStorage.getItem('gym_dirty') === '1'
        if (state && (!hasData(S) || ((state._ts || 0) >= (S._ts || 0) && !dirty))) {
          const active = S.active
          const next = Object.assign(clone(DEF), state)
          if (active) next.active = active
          persist(next, false)
        } else if (hasData(S)) { await get().pushState() }
      } catch (e) { /* offline — keep local */ }
    },

    async signOut() {
      try { await get().pushState(); await apiLogout() } catch (e) { /* */ }
      clearLocalSession()
    },

    // "Sign out everywhere": kills every session of this account on any device. Not swallowed:
    // if it fails, sessions elsewhere are still valid and wiping this device would be wrong.
    async signOutAll() {
      await get().pushState()
      await apiLogoutAll()
      clearLocalSession()
    },

    // Ask the server who we are. A signed-in but not-yet-approved account still gets its user
    // object back (status PENDING) so the UI can show the waiting room instead of a login loop;
    // DISABLED accounts are bounced to logged-out by the API itself.
    async boot() {
      try {
        const meRes = await api('/api/me')
        get().setUser(meRes.user)
        if (meRes.user.status === 'ACTIVE') {
          await get().pullState()
          flushWorkoutQueue()
          await get().pullWorkouts()
        }
        const tz = localTZ()
        if (get().S.reminder?.on && get().S.reminder.tz !== tz) {
          get().update(s => { s.reminder = { ...s.reminder, tz } })
        }
      } catch (e) {
        if (e.status === 401) get().setUser(null)
      }
      set({ ready: true })
    },

    // Finished workouts live in the server's relational table; S.workouts is this device's
    // mirror of it. Server wins for anything already uploaded — local-only entries (logged
    // offline but not yet flushed) survive until their upload succeeds.
    async pullWorkouts() {
      try {
        const rows = await api('/api/workouts?limit=200')
        if (!Array.isArray(rows)) return
        const queuedIds = new Set((JSON.parse(localStorage.getItem('og_wlog_queue') || '[]')).map(p => p.id))
        const remote = rows.map(r => ({
          id: r.id,
          d: typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10),
          start: r.startedAt ? Date.parse(r.startedAt) : undefined,
          end: r.endedAt ? Date.parse(r.endedAt) : undefined,
          name: r.routineName || '',
          vol: r.totalVolume || 0,
          prs: [],
          entries: Array.isArray(r.entries) ? r.entries : [],
        }))
        const localOnly = get().S.workouts.filter(w =>
          !remote.some(r => r.id === w.id) &&
          (queuedIds.has(w.id) || (w._local === true)))
        const next = [...remote, ...localOnly].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
        const cur = get().S.workouts
        if (JSON.stringify(cur.map(w => w.id)) !== JSON.stringify(next.map(w => w.id))) {
          persist({ ...clone(get().S), workouts: next }, false)
        }
      } catch (e) { /* offline — keep local mirror */ }
    }
  }
})

export { hasData }

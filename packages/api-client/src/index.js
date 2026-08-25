// @og/api-client — shared backend access for every openGym front-end.
//
// One place knows how to talk to the NestJS API: JSON in/out, cookie sessions, typed errors.
// Apps register an onUnauthorized handler (usually "clear local session, show login") so a
// dead or demoted session anywhere lands the user somewhere sane instead of leaking 401s
// out of unrelated fetches.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data || {}
  }
}

let onUnauthorizedFn = null
let onForbiddenFn = null

/** Register global handlers: fn(err) fires on any 401 / 403 from any call. */
export function setAuthHandlers({ unauthorized, forbidden } = {}) {
  onUnauthorizedFn = unauthorized || null
  onForbiddenFn = forbidden || null
}

export async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts
  })
  let data = {}
  try { data = await r.json() } catch { /* empty body is fine */ }
  if (!r.ok) {
    const e = new ApiError(data.error || data.message || ('HTTP ' + r.status), r.status, data)
    if (r.status === 401 && onUnauthorizedFn) { try { onUnauthorizedFn(e) } catch { /* */ } }
    if (r.status === 403 && onForbiddenFn && !data.silent) { try { onForbiddenFn(e) } catch { /* */ } }
    throw e
  }
  return data
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
const put = (path, body) => api(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })
const del = path => api(path, { method: 'DELETE' })

/* ---------- auth ---------- */

/** Full-page redirect into the Google OAuth flow; `next` is where to land afterwards. */
export const googleLogin = (next = '/') => {
  window.location.href = '/api/auth/google?next=' + encodeURIComponent(next)
}

export const logout = () => post('/api/auth/logout')
export const logoutAll = () => post('/api/auth/logout-all')
export const me = () => api('/api/me')

/* ---------- state blob (routines / week plan / settings / bodyweight) ---------- */
export const getState = () => api('/api/state')
export const putState = state => put('/api/state', { state })

/* ---------- workouts (relational logs) ---------- */
export const postWorkout = log => post('/api/workouts', log)
export const getWorkouts = q => api('/api/workouts' + (q ? '?' + new URLSearchParams(q) : ''))
export const deleteWorkout = id => del('/api/workouts/' + id)

/* ---------- membership & payments ---------- */
export const myMembership = () => api('/api/membership/me')
export const listPlans = () => api('/api/plans')
export const createOrder = planId => post('/api/payments/order', { planId })
export const verifyPayment = p => post('/api/payments/verify', p)
export const myPayments = () => api('/api/payments/me')
export const freezeMembership = days => post('/api/membership/freeze', { days })

/* ---------- scheduling ---------- */
export const getSlots = date => api('/api/slots?date=' + date)
export const bookSlot = slotId => post('/api/bookings', { slotId })
export const cancelBooking = id => post(`/api/bookings/${id}/cancel`)
export const myBookings = () => api('/api/bookings/me')
export const joinWaitlist = slotId => post(`/api/slots/${slotId}/waitlist`)
export const leaveWaitlist = slotId => del(`/api/slots/${slotId}/waitlist`)
export const getPatterns = () => api('/api/bookings/patterns')
export const savePatterns = patterns => put('/api/bookings/patterns', { patterns })
export const checkInCode = () => api('/api/bookings/checkin-code')
export const checkInScan = code => post('/api/bookings/check-in', { code })
export const slotAttendees = id => api(`/api/slots/${id}/attendees`)

/* ---------- trainers ---------- */
export const listTrainers = () => api('/api/trainers')
export const myTrainerProfile = () => api('/api/trainers/me')
export const updateTrainerProfile = p => put('/api/trainers/me', p)
export const ptBookings = () => api('/api/pt/bookings')
export const bookPt = b => post('/api/pt/bookings', b)

/* ---------- programs ---------- */
export const listPrograms = () => api('/api/programs')
export const createProgram = p => post('/api/programs', p)
export const updateProgram = (id, p) => put('/api/programs/' + id, p)
export const enrollProgram = (programId, memberIds) => post(`/api/programs/${programId}/enroll`, { memberIds })
export const assignedPrograms = () => api('/api/programs/assigned')
export const advanceEnrollment = (id, n = 1) => post(`/api/enrollments/${id}/advance`, { days: n })

/* ---------- exercise unlocks ---------- */
export const myUnlocks = () => api('/api/exercises/unlocks')
export const unlockFor = (memberId, what) => post('/api/exercises/unlock', { memberId, ...what })
export const unlockPresets = () => api('/api/exercises/presets')

/* ---------- nutrition ---------- */
export const dayNutrition = date => api('/api/nutrition?date=' + date)
export const addNutrition = e => post('/api/nutrition', e)
export const deleteNutrition = id => del('/api/nutrition/' + id)
export const offSearch = q => api('/api/nutrition/off/search?q=' + encodeURIComponent(q))
export const offBarcode = code => api('/api/nutrition/off/barcode/' + encodeURIComponent(code))
export const waterLog = (date, ml) => put('/api/nutrition/water', { date, ml })
export const getProfile = () => api('/api/profile')
export const putProfile = p => put('/api/profile', p)

export default api

/* ---------- React Query factory (shared config for every openGym front-end) ---------- */

/** Sensible defaults: 4xx never retries (auth/validation errors are deterministic),
 *  5xx/network retries twice with backoff. Apps may override anything per-query. */
export function createQueryClient(QueryClientCtor) {
  return new QueryClientCtor({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          const status = error?.status
          if (Number.isInteger(status) && status >= 400 && status < 500) return false
          return failureCount < 2
        },
      },
      mutations: { retry: false },
    },
  })
}

/** Standard key helpers so invalidation stays predictable across apps. */
export const qk = {
  me: ['me'],
  state: ['state'],
  workouts: (q) => ['workouts', q ?? {}],
  membership: ['membership'],
  plans: ['plans'],
  paymentsMe: ['payments', 'me'],
  slots: (date) => ['slots', date],
  myBookings: ['bookings', 'me'],
  patterns: ['bookings', 'patterns'],
  trainers: ['trainers'],
  trainerMe: ['trainer', 'me'],
  ptBookings: ['pt', 'me'],
  programs: ['programs'],
  assignedPrograms: ['programs', 'assigned'],
  unlocks: (memberId) => ['unlocks', memberId ?? 'me'],
  premiumExercises: ['exercises', 'premium'],
  nutrition: (date) => ['nutrition', date],
  profile: ['profile'],
  favorites: ['nutrition', 'favorites'],
}

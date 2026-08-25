import { useSyncExternalStore } from 'react'
import { setAuthHandlers } from '@og/api-client'

const subs = new Set()
let user = null

export function getSessionUser() {
  return user
}

export function setSessionUser(u) {
  user = u
  try {
    if (u) localStorage.setItem('og_admin_user', JSON.stringify(u))
    else localStorage.removeItem('og_admin_user')
  } catch { /* private mode */ }
  subs.forEach(f => f())
}

export function useSessionUser() {
  return useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn) }, () => user)
}

setAuthHandlers({ unauthorized: () => setSessionUser(null) })

try { user = JSON.parse(localStorage.getItem('og_admin_user')) || null } catch { /* */ }

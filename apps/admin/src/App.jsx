import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { api, googleLogin, logout } from '@og/api-client'
import Icon from '@og/ui'
import { getSessionUser, setSessionUser, useSessionUser } from './lib/session.js'
import { ToastHost } from './components/bits.jsx'
import Overview from './views/Overview.jsx'
import Approvals from './views/Approvals.jsx'
import Members from './views/Members.jsx'
import Payments from './views/Payments.jsx'
import Plans from './views/Plans.jsx'
import Slots from './views/Slots.jsx'
import Analytics from './views/Analytics.jsx'
import Settings from './views/Settings.jsx'

const NAV = [
  { to: '/overview', icon: 'house', label: 'Overview' },
  { to: '/approvals', icon: 'check', label: 'Approvals' },
  { to: '/members', icon: 'person', label: 'Members' },
  { to: '/payments', icon: 'clipboard', label: 'Payments' },
  { to: '/plans', icon: 'list', label: 'Plans' },
  { to: '/slots', icon: 'calendar', label: 'Slots' },
  { to: '/analytics', icon: 'chartLine', label: 'Analytics' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

export default function App() {
  const user = useSessionUser()
  const loc = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  // Ask the API who we are on first paint — a valid cookie restores the session.
  useEffect(() => {
    if (getSessionUser()) return
    api('/api/me').then(r => {
      if (r.user.status === 'ACTIVE' && ['ADMIN'].includes(r.user.role)) setSessionUser(r.user)
      else if (r.user.status === 'ACTIVE') setSessionUser({ ...r.user, wrongApp: true })
      else setSessionUser(r.user)
    }).catch(() => {})
  }, [])

  if (!user || user.wrongApp) return <Login wrongApp={user?.wrongApp} />
  if (user.status !== 'ACTIVE') return <AccountWall user={user} />
  return (
    <>
      <AdminShell user={user} />
      <ToastHost />
    </>
  )
}

function Login({ wrongApp }) {
  return (
    <div className="max-w-[560px] mx-auto px-6 flex flex-col justify-center min-h-[80vh] text-center">
      <div className="text-[54px] flex justify-center text-acc"><Icon name="dumbbell" /></div>
      <h1 className="text-[34px] font-bold tracking-[-.028em] mt-2.5 mb-1">openGym Admin</h1>
      <p className="text-label-2 mb-8">{wrongApp ? 'This console is for gym admins.' : 'Admin console — members, money and the whole gym at a glance.'}</p>
      <button onClick={() => googleLogin('/overview')}
        className="flex items-center justify-center gap-3 w-full max-w-[320px] mx-auto bg-white text-[#1f1f1f] rounded-xl py-[13px] px-4 text-[16px] font-semibold active:scale-[.97] transition-transform no-tap">
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
        Sign in with Google
      </button>
    </div>
  )
}

function AccountWall({ user }) {
  const pending = user.status === 'PENDING'
  return (
    <div className="max-w-[560px] mx-auto px-6 flex flex-col justify-center min-h-[80vh] text-center">
      <div className={'text-[40px] mb-3 ' + (pending ? 'text-label-3' : 'text-red')}><Icon name={pending ? 'clock' : 'lock'} /></div>
      <h2 className="text-[22px] font-semibold">{pending ? 'Waiting for approval' : 'Account disabled'}</h2>
      <p className="text-label-2 text-[14px] mt-2 max-w-[380px] mx-auto">
        {pending ? 'A gym admin needs to approve your account before you can use the admin console.' : 'This account has been deactivated. Contact a gym admin.'}
      </p>
      <button className="text-label-3 text-[13px] underline mt-6 bg-transparent border-0 cursor-pointer" onClick={() => logout().then(() => setSessionUser(null)).catch(() => {})}>
        Use a different account
      </button>
    </div>
  )
}

function AdminShell({ user }) {
  const loc = useLocation()
  const signOut = () => logout().finally(() => setSessionUser(null))
  const NavBtn = ({ to, icon, label, side }) => (
    <button onClick={() => { window.location.hash = '#' + to }}
      className={(side ? sideCls(loc.pathname === to) : botCls(loc.pathname === to))}>
      <Icon name={icon} className="text-[22px]" />{side ? label : <span className="text-[10px] font-medium">{label}</span>}
    </button>
  )
  const sideCls = act => 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ' + (act ? 'bg-acc-soft text-acc' : 'text-label-2 hover:bg-surface')
  const botCls = act => 'flex-1 flex flex-col items-center gap-[2px] py-1 no-tap ' + (act ? 'text-acc' : 'text-label-3')

  return (
    <div className="min-h-screen flex">
      {/* sidebar ≥1000px */}
      <aside className="hidden desk:flex flex-col w-[232px] shrink-0 border-r border-sep p-3 gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="text-acc text-[26px]"><Icon name="dumbbell" /></span>
          <div>
            <div className="font-bold tracking-[-.02em] leading-none">openGym</div>
            <div className="text-[11px] text-label-3">Admin console</div>
          </div>
        </div>
        {NAV.map(n => <NavBtn key={n.to} side {...n} />)}
        <div className="mt-auto px-2 pb-1 text-[13px] text-label-2 truncate">{user.name}</div>
        <button onClick={signOut} className="mx-1 mb-1 text-left px-3 py-2 rounded-xl text-[14px] text-red hover:bg-surface">Sign out</button>
      </aside>

      {/* content */}
      <main className="flex-1 min-w-0 px-4 desk:px-8 py-5 pb-[calc(70px+env(safe-area-inset-bottom,0px))] desk:pb-8 max-w-[1100px]">
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/members" element={<Members />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/slots" element={<Slots />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>

      {/* bottom nav <1000px */}
      <nav className="desk:hidden fixed bottom-0 inset-x-0 z-50 flex bg-[color-mix(in_srgb,var(--bg-el)_88%,transparent)] backdrop-blur-xl border-t-[0.5px] border-sep-op pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))]">
        {NAV.slice(0, 5).map(n => <NavBtn key={n.to} {...n} />)}
      </nav>
    </div>
  )
}

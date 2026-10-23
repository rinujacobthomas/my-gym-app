import { Suspense, lazy, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { ACCENTS } from './lib/format.js'
import { t, setLang, useLang } from './lib/i18n.js'
import { setNav } from './lib/nav.js'
import { useWakeLock } from './lib/wakelock.js'
import { startWorkout } from './lib/startWorkout.js'
import { startFlow } from './sheets.jsx'
import Icon from './components/Icon.jsx'
import TabBar from './components/TabBar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import Modals from './components/Modals.jsx'
import Toast from './components/Toast.jsx'
import RestTimer from './components/RestTimer.jsx'
import Login, { AccountWall } from './views/Login.jsx'
import Home from './views/Home.jsx'
import Plan from './views/Plan.jsx'
import RoutineEdit from './views/RoutineEdit.jsx'
import Workout from './views/Workout.jsx'
import Stats from './views/Stats.jsx'
import History from './views/History.jsx'
import Library from './views/Library.jsx'
import Settings from './views/Settings.jsx'

const Book = lazy(() => import('./views/Book.jsx'))
const QrCode = lazy(() => import('./views/QrCode.jsx'))
const Membership = lazy(() => import('./views/Membership.jsx'))
const NutritionView = lazy(() => import('./views/NutritionView.jsx'))
const Programs = lazy(() => import('./views/Programs.jsx'))
const Trainers = lazy(() => import('./views/Trainers.jsx'))

bindUI(useUI)   // lets the shared controls open sheets without importing the store at module scope

function applyPrefs(theme, accent) {
  const de = document.documentElement
  de.dataset.theme = theme === 'light' ? 'light' : 'dark'
  de.dataset.accent = ACCENTS[accent] ? accent : 'red'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = de.dataset.theme === 'light' ? '#f2f2f7' : '#000000'
}

const Splash = () => (
  <div className="pt-[44vh] flex justify-center text-[34px] text-label-3">
    <Icon name="dumbbell" />
  </div>
)

const SECTIONS = [
  {
    title: 'Training',
    items: [
      { to: '/home', icon: 'house', label: 'Home' },
      { to: '/plan', icon: 'calendar', label: 'My Plan' },
      { to: '/library', icon: 'list', label: 'Exercises' },
      { to: '/history', icon: 'history', label: 'History' },
      { to: '/stats', icon: 'chart', label: 'Stats' },
    ],
  },
  {
    title: 'Gym',
    items: [
      { to: '/book', icon: 'key', label: 'Book a slot' },
      { to: '/nutrition', icon: 'plate', label: 'Nutrition' },
      { to: '/programs', icon: 'clipboard', label: 'Programs' },
      { to: '/trainers', icon: 'personCircle', label: 'Coaches' },
      { to: '/membership', icon: 'crown', label: 'Membership' },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/settings', icon: 'gear', label: 'Settings' },
    ],
  },
]

// Desktop-only (≥1000px) navigation rail; the floating tab bar below it is hidden at this width.
function DeskSidebar() {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const signOut = useStore(s => s.signOut)
  if (!user) return null
  const active = to => loc.pathname === to || (to !== '/home' && loc.pathname.startsWith(to + '/'))

  const Item = ({ to, icon, label }) => (
    <button onClick={() => nav(to)}
      className={'flex items-center gap-2.5 w-full rounded-lg px-3 py-[7px] text-left no-tap transition-colors duration-150 ' +
        (active(to) ? 'bg-surface text-label font-medium' : 'text-label-2 hover:bg-surface/60 active:bg-surface-2')}>
      <Icon name={icon} className="text-[17px] [--icon-stroke:1.9] shrink-0" />
      <span className="text-[14px] tracking-[-.006em] truncate">{t(label)}</span>
    </button>
  )

  return (
    <aside className="hidden desk:flex fixed left-0 top-0 bottom-0 z-40 w-[232px] flex-col px-3 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-[calc(env(safe-area-inset-bottom,0px)+14px)]
      bg-bg-el border-r-[0.5px] border-sep-op overflow-y-auto">
      <button className="flex items-center gap-2.5 px-2 mb-4 shrink-0" onClick={() => nav('/home')}>
        <span className="w-[30px] h-[30px] rounded-[9px] bg-acc text-on-acc flex items-center justify-center"><Icon name="dumbbell" className="text-[18px]" /></span>
        <span className="text-[19px] font-bold tracking-[-.02em]">openGym</span>
      </button>

      <button onClick={() => startWorkout(S, { onStart: startFlow, nav })}
        className={'shrink-0 flex items-center justify-center gap-2 w-full rounded-xl py-[13px] font-semibold text-[15px] tracking-[-.01em] no-tap transition-transform duration-150 ease-[var(--ease)] active:scale-[.98] ' +
          (S.active ? 'bg-orange text-black shadow-[0_6px_18px_-4px_color-mix(in_srgb,var(--orange)_55%,transparent)]' : 'bg-acc text-on-acc shadow-[0_6px_18px_-4px_color-mix(in_srgb,var(--acc)_55%,transparent)]')}>
        <Icon name={S.active ? 'play' : 'dumbbell'} className="text-[18px]" />
        {S.active ? t('Resume workout') : t('Start workout')}
      </button>

      <nav className="mt-2 min-h-0">
        {SECTIONS.map(sec => (
          <div key={sec.title} className="mb-1">
            <h4 className="text-[11px] uppercase tracking-[.05em] text-label-3 px-3 pt-4 pb-1.5">{t(sec.title)}</h4>
            <div className="flex flex-col gap-px">{sec.items.map(it => <Item key={it.to} {...it} />)}</div>
          </div>
        ))}
        <h4 className="text-[11px] uppercase tracking-[.05em] text-label-3 px-3 pt-4 pb-1.5">{t('Account')}</h4>
        <div className="flex flex-col gap-px">
          <Item to="/settings" icon="gear" label="Settings" />
          <button onClick={() => signOut()}
            className="flex items-center gap-2.5 w-full rounded-lg px-3 py-[7px] text-left no-tap transition-colors duration-150 text-red hover:bg-surface/60 active:bg-surface-2">
            <Icon name="signOut" className="text-[17px] [--icon-stroke:1.9] shrink-0" />
            <span className="text-[14px] tracking-[-.006em]">{t('Sign out')}</span>
          </button>
        </div>
      </nav>

      <div className="mt-auto pt-3 shrink-0">
        <div className="lrow relative flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5">
          <span className="w-[34px] h-[34px] rounded-full shrink-0 text-[15px] font-semibold text-white bg-acc flex items-center justify-center">
            {(user.name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-medium tracking-[-.006em] leading-[1.25] truncate">{user.name}</span>
            <span className="block text-label-3 text-[12px] leading-[1.3] truncate">{user.email}</span>
          </span>
        </div>
      </div>
    </aside>
  )
}

function Shell() {
  const navigate = useNavigate()
  const loc = useLocation()
  const { S, user, ready } = useStore()
  const langV = useLang()   // re-renders the whole shell when the language (pack) changes
  useEffect(() => { setNav(navigate) }, [navigate])
  useEffect(() => { applyPrefs(S.theme, S.accent) }, [S.theme, S.accent])
  useEffect(() => { setLang(S.lang || 'en') }, [langV, S.lang])
  useEffect(() => { document.documentElement.lang = S.lang || 'en' }, [langV, S.lang])
  // every tab/route change starts at the top of the page
  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])
  // bound to the workout, not to the route — checking Stats mid-session keeps the screen on
  useWakeLock(!!S.active && S.keepAwake !== false)

  if (!ready) return (
    <div id="app" className="max-w-[560px] mx-auto px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-[calc(128px+env(safe-area-inset-bottom,0px))]">
      <Splash />
    </div>
  )

  // Not signed in at all → login screen.
  if (!user) return <><Login /><Toast /></>

  // Signed in but not activated yet (admin approves accounts) → waiting room.
  if (user.status && user.status !== 'ACTIVE') return <><AccountWall user={user} /><Toast /></>

  return (
    <>
      {/* keyed on the route: a view that throws is contained, and switching tabs
          re-mounts the boundary, so the tab bar is always a way out */}
      <div id="app" key={loc.pathname}
        className="vfade max-w-[560px] mx-auto px-4 pt-[calc(env(safe-area-inset-top,0px)+8px)] pb-[calc(128px+env(safe-area-inset-bottom,0px))] desk:max-w-[1200px] desk:ml-[232px] desk:pt-8 animate-[viewfade_220ms_var(--ease)]">
        <ErrorBoundary>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/home" element={<Home />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/plan/r/:id" element={<RoutineEdit />} />
              <Route path="/workout" element={<Workout />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/history" element={<History />} />
              <Route path="/library" element={<Library />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/book" element={<Book />} />
              <Route path="/qr" element={<QrCode />} />
              <Route path="/membership" element={<Membership />} />
              <Route path="/nutrition" element={<NutritionView />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/trainers" element={<Trainers />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
      <DeskSidebar />
      <TabBar onStart={startFlow} />
      <RestTimer />
      <Modals />
      <Toast />
    </>
  )
}

export default function App() {
  const boot = useStore(s => s.boot)
  useEffect(() => { boot() }, [boot])
  return <HashRouter><Shell /></HashRouter>
}

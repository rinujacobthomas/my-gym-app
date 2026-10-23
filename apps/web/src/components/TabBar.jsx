import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { startWorkout } from '../lib/startWorkout.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Gym things first (what members come to the app for at the door), then training tools.
const MORE = [
  { icon: 'crown', to: '/membership', label: 'Membership', tint: 'var(--yellow)' },
  { icon: 'clipboard', to: '/programs', label: 'Programs', tint: 'var(--teal)' },
  { icon: 'personCircle', to: '/trainers', label: 'Coaches', tint: 'var(--orange)' },
  { icon: 'calendar', to: '/plan', label: 'My Plan', tint: 'var(--blue)' },
  { icon: 'chart', to: '/stats', label: 'Stats', tint: 'var(--indigo)' },
  { icon: 'history', to: '/history', label: 'History', tint: 'var(--purple)' },
  { icon: 'list', to: '/library', label: 'Exercises', tint: 'var(--mint)' },
  { icon: 'gear', to: '/settings', label: 'Settings', tint: 'var(--grey)' },
]

// no ellipsis glyph in the icon set — three filled dots, drawn inline
const Dots = ({ className }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className={'icn ' + (className || '')}>
    <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
  </svg>
)

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const openSheet = useUI(s => s.openSheet)
  if (!user) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  const moreOn = MORE.some(m => m.to.slice(1) === cur)

  const openMore = () => openSheet(close =>
    <>
      <h3 className="text-[20px] font-semibold tracking-[-.021em] mb-3.5">{t('More')}</h3>
      <div className="bg-surface rounded-[14px] overflow-hidden">
        {MORE.map(m => (
          <button key={m.to} className="lrow relative flex items-center gap-3 w-full text-left px-3.5 py-[11px] min-h-[46px] text-label bg-transparent no-tap active:bg-surface-2"
            onClick={() => { close(); nav(m.to) }}>
            <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white" style={{ background: m.tint }}><Icon name={m.icon} /></span>
            <span className="flex-1 min-w-0 text-[17px] tracking-[-.012em] leading-[1.25]">{t(m.label)}</span>
            <Icon name="chevronRight" className="text-label text-[15px] shrink-0 [--icon-stroke:2.4]" />
          </button>
        ))}
      </div>
      <div className="h-2" />
    </>
  )

  const Tab = ({ icon, to, label, on, onClick }) => (
    <button className={'flex-1 flex flex-col items-center gap-[3px] pt-[3px] text-[10px] font-medium tracking-[.005em] no-tap transition-colors duration-150 ' + (on ? 'text-acc' : 'text-label-3')}
      onClick={onClick || (() => nav(to))}>
      {icon
        ? <Icon name={icon} className="text-[25px] [--icon-stroke:1.65] text-label opacity-40" />
        : <Dots className="text-[25px] text-label opacity-40" />}
      <span className={on ? 'opacity-100' : ''}>{label}</span>
    </button>
  )

  return (
    <nav id="tabbar"
      className="desk:hidden fixed z-50 bottom-0 inset-x-0 flex justify-around items-end no-tap
        pt-[7px] px-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))]
        bg-[color-mix(in_srgb,var(--bg-el)_72%,transparent)] backdrop-blur-[24px] backdrop-saturate-180
        border-t-[0.5px] border-sep-op">
      <Tab icon="house" to="/home" label={t('Home')} on={cur === 'home'} />
      <Tab icon="calendar" to="/book" label={t('Book')} on={cur === 'book'} />
      <button className={'flex-1 flex flex-col items-center gap-[3px] pt-[3px] text-[10px] font-medium tracking-[.005em] no-tap ' + (S.active ? 'text-orange' : 'text-acc')} onClick={() => startWorkout(S, { onStart, nav })}>
        <span className={'w-[52px] h-[52px] rounded-full flex items-center justify-center relative transition-transform duration-150 ease-[var(--ease)] active:scale-[.93] ' +
          (S.active ? 'bg-orange text-black shadow-[0_6px_18px_-4px_color-mix(in_srgb,var(--orange)_55%,transparent)]' : 'bg-acc text-on-acc shadow-[0_6px_18px_-4px_color-mix(in_srgb,var(--acc)_55%,transparent)]')}>
          <Icon name={S.active ? 'play' : 'dumbbell'} className="text-[26px] [--icon-stroke:2]" />
          {S.active && <span className="absolute inset-0 rounded-full border-2 border-orange animate-[ping_1.9s_var(--ease)_infinite]" />}
        </span>
        <span className="font-semibold">{S.active ? t('Resume') : t('Start')}</span>
      </button>
      <Tab icon="plate" to="/nutrition" label={t('Nutrition')} on={cur === 'nutrition'} />
      <Tab label={t('More')} on={moreOn} onClick={openMore} />
    </nav>
  )
}

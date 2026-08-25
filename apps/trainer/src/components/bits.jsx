import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@og/ui'
import { Button } from '@og/ui'

/* ---------- toast ---------- */

let toastState = { msg: '', key: 0 }
const toastSubs = new Set()
let toastTm = null

export function toast(msg) {
  toastState = { msg: String(msg ?? ''), key: toastState.key + 1 }
  toastSubs.forEach(f => f())
  clearTimeout(toastTm)
  toastTm = setTimeout(() => {
    toastState = { ...toastState, msg: '' }
    toastSubs.forEach(f => f())
  }, 2400)
}

export function ToastHost() {
  const s = useSyncExternalStore(fn => { toastSubs.add(fn); return () => toastSubs.delete(fn) }, () => toastState)
  return (
    <div
      className={'fixed left-1/2 z-[200] -translate-x-1/2 rounded-full px-5 py-[11px] text-[15px] font-medium text-center max-w-[88vw] ' +
        'bottom-[calc(96px+env(safe-area-inset-bottom,0px))] desk:bottom-8 bg-[color-mix(in_srgb,var(--surface-2)_88%,transparent)] backdrop-blur-[20px] backdrop-saturate-180 ' +
        'shadow-[0_10px_30px_-6px_rgba(0,0,0,.5)] pointer-events-none transition-[opacity,transform] duration-200 ease-[var(--ease)] ' +
        (s.msg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[6px]')}>
      {s.msg}
    </div>
  )
}

/* ---------- time helpers ---------- */

export const minToT = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(Math.round(min) % 60).padStart(2, '0')
export const fmtRange = (a, b) => minToT(a) + ' – ' + minToT(b)
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

export const durTxt = m => {
  m = Math.max(0, Math.round(m))
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60), r = m % 60
  return h + 'h' + (r ? ' ' + r + 'm' : '')
}

export const clockOf = ts => {
  try {
    const d = new Date(ts)
    return minToT(d.getHours() * 60 + d.getMinutes())
  } catch { return '' }
}

export function useTick(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const iv = setInterval(() => { if (!document.hidden) setNow(Date.now()) }, ms)
    return () => clearInterval(iv)
  }, [ms])
  return now
}

export const errText = e => (e && (e.message || e.error)) || 'Something went wrong'

/* ---------- page chrome ---------- */

export function PageHead({ title, sub, right, back }) {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-3 mt-1 mb-5">
      {back && (
        <button onClick={() => nav(-1)} aria-label="Back"
          className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] no-tap transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90">
          <Icon name="chevronLeft" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-[28px] desk:text-[32px] leading-[1.08] font-bold tracking-[-.028em] m-0 truncate">{title}</h1>
        {sub != null && <p className="text-label-2 text-[15px] tracking-[-.006em] mt-1 mb-0 truncate">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Empty({ icon = 'info', title, hint }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6 gap-1.5">
      <div className="text-[36px] text-label-3 mb-1"><Icon name={icon} /></div>
      <div className="text-[16px] font-medium text-label-2">{title}</div>
      {hint && <div className="text-[13px] text-label-3 max-w-[340px] leading-[1.45]">{hint}</div>}
    </div>
  )
}

/* ---------- loading ---------- */

export const Skel = ({ h = 56, className = '' }) =>
  <div className={'animate-pulse bg-surface rounded-xl ' + className} style={{ height: h }} />

export function SkelList({ n = 4, h = 64 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }, (_, i) => <Skel key={i} h={h} />)}
    </div>
  )
}

export function BusyBtn({ busy, icon, children, variant = 'primary', size, className = '', disabled, ...rest }) {
  return (
    <Button variant={variant} size={size} disabled={disabled || busy} className={className} {...rest}>
      {busy
        ? <Icon name="reset" className={(size === 'sm' || size === 'xs' ? 'text-[15px]' : 'text-[19px]') + ' animate-spin'} />
        : icon ? <Icon name={icon} className={size === 'sm' || size === 'xs' ? 'text-[15px]' : 'text-[19px]'} /> : null}
      {children}
    </Button>
  )
}

/* ---------- chips / stats ---------- */

export function Chip({ on, onClick, children, disabled, className = '' }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={
        'inline-flex items-center gap-[5px] rounded-full pl-3 pr-[10px] py-[7px] text-[13.5px] font-medium no-tap border-0 transition-all duration-150 active:scale-95 disabled:opacity-40 ' +
        (on ? 'bg-acc-soft text-acc ' : 'bg-surface text-label-2 ') + className}>
      {on && <Icon name="check" className="text-[13px] [--icon-stroke:2.6]" />}
      <span className="truncate max-w-[160px]">{children}</span>
    </button>
  )
}

export function Stat({ label, value, tone, sub }) {
  return (
    <div className="bg-surface rounded-[14px] px-3.5 py-3 min-w-0">
      <div className="text-label-2 text-[12.5px] font-normal tracking-[-.004em] truncate">{label}</div>
      <div className="text-[22px] font-semibold tracking-[-.026em] mt-[3px] leading-[1.05] truncate"
        style={{ color: tone ? `var(--${tone})` : undefined }}>
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-label-3 mt-[2px] truncate">{sub}</div>}
    </div>
  )
}

export function Avatar({ name, url, size = 38 }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
  if (url) {
    return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <span className="rounded-full bg-acc-soft text-acc font-semibold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials || '?'}
    </span>
  )
}

export function StatusDot({ on }) {
  return (
    <span className={'relative flex w-[9px] h-[9px] rounded-full shrink-0 ' + (on ? 'bg-green' : 'bg-label-4')}>
      {on && <span className="absolute inset-0 rounded-full bg-green animate-ping opacity-60" />}
    </span>
  )
}

/* ---------- modal / confirm ---------- */

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[120] flex items-end desk:items-center justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full desk:max-w-[520px] bg-bg-el rounded-t-[22px] desk:rounded-[22px] p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] desk:pb-5 max-h-[88vh] overflow-y-auto shadow-[0_24px_60px_-12px_rgba(0,0,0,.6)] animate-[slideup_.22s_var(--ease)]">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-[20px] font-semibold tracking-[-.021em] m-0 min-w-0 truncate">{title}</h3>
          <button onClick={onClose} aria-label="Close"
            className="w-[30px] h-[30px] rounded-full shrink-0 bg-surface-2 text-label-2 flex items-center justify-center no-tap active:bg-surface-3">
            <Icon name="xmark" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmModal({ title, message, confirmText = 'Confirm', danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-[15px] text-label-2 leading-[1.5] mt-0">{message}</p>
      <div className="flex gap-2 mt-5">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <BusyBtn variant={danger ? 'danger' : 'primary'} busy={busy} className="flex-1" onClick={onConfirm}>{confirmText}</BusyBtn>
      </div>
    </Modal>
  )
}

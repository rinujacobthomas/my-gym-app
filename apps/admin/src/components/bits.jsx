import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@og/ui'
import { Button, SearchField, TextField, TextArea, NumberField, Segmented } from '@og/ui'
import { hhmm } from '../lib/format.js'

export { SearchField, TextField, TextArea, NumberField, Segmented }

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
  }, 2600)
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

export const errText = e => (e && (e.message || e.error)) || 'Something went wrong'

export async function copyText(s) {
  try {
    await navigator.clipboard.writeText(String(s))
    toast('Copied')
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = String(s)
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      toast('Copied')
    } catch { toast('Copy failed') }
  }
}

/* ---------- page chrome ---------- */

export function PageHead({ title, sub, right }) {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-3 mt-1 mb-5">
      <button onClick={() => nav(-1)} aria-label="Back"
        className="desk:hidden w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] no-tap transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90">
        <Icon name="chevronLeft" />
      </button>
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

export function ErrorBox({ children }) {
  return (
    <div className="bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-red rounded-xl px-4 py-3 text-[14px] mb-4 flex items-center gap-2">
      <Icon name="info" className="text-[17px] shrink-0" />{children}
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

/* ---------- chips / pills / avatar ---------- */

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

export const PAY_STATUS_TONE = { CREATED: 'yellow', PAID: 'green', FAILED: 'red', REFUNDED: 'purple' }
export const METHOD_TONE = { ONLINE: 'blue', CASH: 'green', CARD_POS: 'purple', DAY_PASS: 'teal' }
export const USER_STATUS_TONE = { PENDING: 'orange', ACTIVE: 'green', DISABLED: 'red' }

export function Pill({ tone = 'grey', children }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold whitespace-nowrap leading-[1.6]"
      style={{ color: `var(--${tone})`, background: `color-mix(in srgb, var(--${tone}) 13%, transparent)` }}>
      {children}
    </span>
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

/* ---------- dropdown ---------- */

export function Dropdown({ value, options, onChange, className = '', align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', onDoc)
    return () => window.removeEventListener('pointerdown', onDoc)
  }, [open])
  const cur = options.find(o => o.value === value)
  return (
    <span ref={ref} className={'relative inline-block ' + className}>
      <button onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[13px] font-medium text-label no-tap transition-colors active:bg-surface-3">
        {cur ? cur.label : value}
        <Icon name="chevronDown" className="text-[11px] text-label-3 [--icon-stroke:2.6]" />
      </button>
      {open && (
        <span className="absolute z-50 mt-1 min-w-[132px] rounded-xl bg-bg-el border-[0.5px] border-sep shadow-[0_18px_40px_-8px_rgba(0,0,0,.55)] overflow-hidden py-1 block" style={align === 'right' ? { right: 0 } : { left: 0 }}>
          {options.map(o => (
            <button key={o.value}
              onClick={() => { setOpen(false); if (o.value !== value) onChange(o.value) }}
              className={'flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] whitespace-nowrap ' + (o.value === value ? 'text-acc font-medium' : 'text-label')}>
              <span className="flex-1">{o.label}</span>
              {o.value === value && <Icon name="check" className="text-[13px] [--icon-stroke:2.6]" />}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/* ---------- time field (HH:MM <-> minutes) ---------- */

export function TimeField({ value, onChange, className = '' }) {
  const [draft, setDraft] = useState(null)
  const commit = raw => {
    setDraft(raw)
    const m = /^([01]?\d|2[0-4]):([0-5]\d)$/.exec(raw.trim())
    if (!m) return
    const h = +m[1], min = +m[2]
    onChange(h === 24 ? (min === 0 ? 1440 : 1439) : h * 60 + min)
  }
  return (
    <input inputMode="numeric" placeholder="HH:MM" title="HH:MM"
      className={'w-[64px] bg-surface-2 rounded-lg px-2 py-[7px] text-[13px] text-center outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)] shrink-0 ' + className}
      value={draft ?? hhmm(value)}
      onFocus={e => e.target.select()}
      onBlur={() => setDraft(null)}
      onChange={e => commit(e.target.value)} />
  )
}

/* ---------- pagination ---------- */

export function Pager({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-3 mt-3 text-[13px] text-label-2">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}
        className="rounded-lg bg-surface px-3 py-1.5 font-medium text-label no-tap transition-colors active:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none">Prev</button>
      <span>Page {page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}
        className="rounded-lg bg-surface px-3 py-1.5 font-medium text-label no-tap transition-colors active:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none">Next</button>
    </div>
  )
}

/* ---------- modal / confirm ---------- */

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[120] flex items-end desk:items-center justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className={'relative w-full bg-bg-el rounded-t-[22px] desk:rounded-[22px] p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] desk:pb-5 max-h-[88vh] overflow-y-auto shadow-[0_24px_60px_-12px_rgba(0,0,0,.6)] animate-[slideup_.22s_var(--ease)] ' + (wide ? 'desk:max-w-[640px]' : 'desk:max-w-[520px]')}>
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

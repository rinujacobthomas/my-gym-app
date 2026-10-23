// openGym control set — Tailwind edition.
//
// Every input in the app is built here rather than styled on top of a native
// widget, so one visual language and one focus treatment cover every platform.
// Styling is Tailwind utilities; colour comes from the theme tokens (bg-surface,
// text-label-2, …) which resolve to the runtime theme's CSS variables.
//
// Shared rules:
//   · every control is driven by (value, onChange) — no internal source of truth
//   · hit targets are ≥44px even when the painted control is smaller
//   · :active gives a scale/tint response so touch feels acknowledged
//   · focus-visible draws a ring (global); pointer interaction never does

import { useRef, useState, useEffect, useCallback, forwardRef } from 'react'
import Icon from './Icon.jsx'

/* ============================ text ============================ */

// Numeric input accepting "," as decimal separator — iOS decimal keypads in many
// locales only offer a comma, and type="number" reports "" for it (value snaps to
// 0). Keeps a local string draft while focused so partial input like "33," survives.
// `nullable` is for fields where "nothing entered" and 0 mean different things (RIR: a
// logged 0 is a set taken to failure). Those clear back to null instead of snapping to 0.
export function NumberField({ value, onChange, decimal = true, nullable = false, className = '', ...rest }) {
  const [draft, setDraft] = useState(null)
  const committed = useRef(null)
  // null and undefined are the same "empty" here — a nullable field's key is dropped once cleared.
  if (draft !== null && (committed.current ?? null) !== (value ?? null)) { setDraft(null); committed.current = null }
  const commit = raw => {
    let s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const i = s.indexOf('.')
    if (i !== -1) s = decimal ? s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '') : s.slice(0, i)
    const n = s === '' || s === '.' ? (nullable ? null : 0) : Math.max(0, parseFloat(s))
    committed.current = n
    setDraft(s)
    onChange(n)
  }
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={'w-full min-w-0 bg-transparent border-none outline-none p-0 text-[17px] font-medium tracking-[-.012em] text-center [appearance:textfield] [&::-webkit-inner-spin-button]:hidden ' + className}
      value={draft ?? (value ?? '')}
      onFocus={e => e.target.select()}
      onChange={e => commit(e.target.value)}
      onBlur={() => { setDraft(null); committed.current = null }}
      {...rest}
    />
  )
}

// forwardRef so callers can focus it or read its value imperatively
export const TextField = forwardRef(function TextField({ className = '', ...rest }, ref) {
  return <input ref={ref} className={'w-full bg-surface rounded-xl px-[15px] py-[13px] text-[17px] tracking-[-.012em] outline-none border-0 transition-shadow duration-150 placeholder:text-label-3 focus:shadow-[inset_0_0_0_2px_var(--acc)] ' + className} {...rest} />
})

export function TextArea({ className = '', ...rest }) {
  return <textarea className={'w-full bg-surface rounded-xl px-[15px] py-[13px] text-[17px] tracking-[-.012em] outline-none border-0 transition-shadow duration-150 placeholder:text-label-3 focus:shadow-[inset_0_0_0_2px_var(--acc)] min-h-[92px] resize-y leading-[1.42] ' + className} {...rest} />
}

export function SearchField({ value, onChange, onClear, ...rest }) {
  return (
    <div className="relative flex items-center">
      <Icon name="magnifier" className="absolute left-[11px] text-[16px] text-label-3 pointer-events-none z-[1] [--icon-stroke:2.1]" />
      <input className="w-full bg-surface-2 rounded-[10px] pl-[35px] pr-9 py-[13px] text-[17px] tracking-[-.012em] outline-none border-0 transition-shadow duration-150 placeholder:text-label-3 focus:shadow-[inset_0_0_0_2px_var(--acc)]" value={value} onChange={onChange} {...rest} />
      {!!value && (
        <button className="absolute right-2 w-[22px] h-[22px] rounded-full bg-label-3 text-bg flex items-center justify-center text-[11px] [--icon-stroke:3]" onClick={onClear} aria-label="Clear">
          <Icon name="xmark" />
        </button>
      )}
    </div>
  )
}

/* ============================ switch ============================ */

export function Switch({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      className={'group w-[51px] h-[31px] rounded-full shrink-0 p-[2px] flex items-center no-tap transition-colors duration-200 ease-[var(--ease)] disabled:opacity-40 ' + (checked ? 'bg-acc' : 'bg-surface-3')}
      onClick={() => onChange(!checked)}
    >
      <span className={'w-[27px] h-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_1px_1px_rgba(0,0,0,.16)] transition-[transform,width] duration-200 ease-[var(--ease)] group-active:w-[31px] ' + (checked ? 'translate-x-[20px] group-active:translate-x-[16px]' : '')} />
    </button>
  )
}

/* ============================ segmented ============================ */

// options: [{ value, label, icon? }]  — the selected pill slides between cells.
export function Segmented({ options, value, onChange, className = '' }) {
  const i = Math.max(0, options.findIndex(o => o.value === value))
  const inline = className.includes('seg-inline')
  return (
    <div className={'relative flex bg-seg-track rounded-[9px] p-[2px] isolate ' + className} style={{ '--n': options.length, '--i': i }}>
      <span aria-hidden="true" className="absolute z-0 top-[2px] bottom-[2px] left-[2px] w-[calc((100%-4px)/var(--n))] translate-x-[calc(100%*var(--i))] bg-surface rounded-[7px] shadow-[0_3px_8px_rgba(0,0,0,.12),0_1px_1px_rgba(0,0,0,.06)] transition-transform duration-200 ease-[var(--ease)]" />
      {options.map(o => (
        <button
          key={o.value}
          className={
            'relative z-[1] flex-1 basis-0 flex items-center justify-center gap-[5px] min-w-0 no-tap transition-opacity duration-150 active:opacity-50 ' +
            (inline ? 'px-2.5 py-[5px] min-h-[28px] text-[13px]' : 'px-2 py-[6px] min-h-[30px] text-[14px]') + ' ' +
            (o.value === value ? 'font-medium text-label' : 'font-normal text-label-2')
          }
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} className={inline ? 'text-[14px]' : 'text-[16px]'} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

/* ============================ stepper ============================ */

export function Stepper({ value, step = 1, onChange, decimal = true, className = '', label, unit }) {
  const set = v => onChange(Math.max(0, Math.round((v || 0) * 100) / 100))
  const inner = (
    <div className={'flex items-center bg-surface-2 rounded-[10px] overflow-hidden min-w-0 ' + className}>
      <button onClick={() => set((+value || 0) - step)} aria-label="Decrease" className="w-10 h-11 shrink-0 text-label text-[16px] flex items-center justify-center transition-colors duration-150 active:bg-surface-3 no-tap">
        <Icon name="minus" className="[--icon-stroke:2.2]" />
      </button>
      <span className="flex-1 min-w-0 flex items-baseline justify-center gap-[3px] px-[2px]">
        <NumberField value={value} decimal={decimal} onChange={onChange} />
        {unit && <i className="not-italic text-[12px] text-label-2 shrink-0">{unit}</i>}
      </span>
      <button onClick={() => set((+value || 0) + step)} aria-label="Increase" className="w-10 h-11 shrink-0 text-label text-[16px] flex items-center justify-center transition-colors duration-150 active:bg-surface-3 no-tap">
        <Icon name="plus" className="[--icon-stroke:2.2]" />
      </button>
    </div>
  )
  if (!label) return inner
  return <div className="flex flex-col gap-1.5 min-w-0"><span className="text-[13px] text-label-2 text-center">{label}</span>{inner}</div>
}

/* ============================ slider ============================ */

// Pointer-driven so the fill, track and thumb are all ours — no ::-webkit-*
// pseudo-elements, which is the only way the control looks identical on every
// platform and can pick up the accent colour.
export function Slider({ value, min = 0, max = 100, step = 1, onChange, className = '' }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  const posToValue = useCallback(clientX => {
    const el = ref.current
    if (!el) return value
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const raw = min + f * (max - min)
    const snapped = Math.round(raw / step) * step
    // step can be fractional (0.1) — round away binary noise
    return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000))
  }, [min, max, step, value])

  useEffect(() => {
    if (!drag) return
    const move = e => {
      e.preventDefault()
      onChange(posToValue(e.touches ? e.touches[0].clientX : e.clientX))
    }
    const up = () => setDrag(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [drag, onChange, posToValue])

  const key = e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
    if (!d) return
    e.preventDefault()
    onChange(Math.min(max, Math.max(min, Math.round((value + d) * 1000) / 1000)))
  }

  return (
    <div
      ref={ref}
      className={'relative h-8 flex items-center cursor-pointer touch-none no-tap ' + className}
      role="slider"
      tabIndex={0}
      aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
      data-nodrag                                  /* keeps the sheet from swipe-dismissing */
      onKeyDown={key}
      onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(true); onChange(posToValue(e.clientX)) }}
    >
      <span className="absolute inset-x-0 h-[6px] rounded-full bg-surface-3 overflow-hidden">
        <span className="block h-full bg-acc rounded-full" style={{ width: pct + '%' }} />
      </span>
      <span
        className={'absolute w-[26px] h-[26px] rounded-full bg-white -translate-x-1/2 shadow-[0_4px_10px_rgba(0,0,0,.22),0_1px_2px_rgba(0,0,0,.16)] transition-transform duration-150 ease-[var(--ease)] ' + (drag ? 'scale-[1.14]' : '')}
        style={{ left: pct + '%' }}
      />
    </div>
  )
}

/* ============================ checkbox ============================ */

export function Check({ checked, onChange, className = '', size }) {
  return (
    <button
      role="checkbox"
      aria-checked={!!checked}
      className={
        'w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center no-tap transition-all duration-150 active:scale-90 ' +
        (checked ? 'bg-acc shadow-none text-on-acc' : 'bg-transparent shadow-[inset_0_0_0_1.8px_var(--label-4)] text-transparent') + ' ' + className
      }
      style={size ? { width: size, height: size } : null}
      onClick={() => onChange(!checked)}
    >
      <Icon name="check" className="text-[16px] [--icon-stroke:2.6]" />
    </button>
  )
}

/* ============================ grouped list ============================ */

// The inset-grouped list is the app's main structural primitive: a titled
// section holding rows separated by hairlines that stop short of the leading
// edge, so the icon column reads as a continuous rail.
export function Section({ title, footer, children, className = '' }) {
  return (
    <section className={'mb-[22px] ' + className}>
      {title && <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">{title}</h2>}
      <div className="bg-surface rounded-[14px] overflow-hidden">{children}</div>
      {footer && <p className="text-[13px] text-label-2 pt-[7px] px-1 leading-[1.38]">{footer}</p>}
    </section>
  )
}

export function Row({ icon, iconTint, title, subtitle, value, accessory = 'none', onClick, danger, children, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={'lrow relative flex items-center gap-3 w-full text-left px-3.5 py-[11px] min-h-[46px] text-label bg-transparent no-tap ' + (onClick ? 'active:bg-surface-2 ' : '') + (danger ? 'text-red ' : '') + className}>
      {icon && <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white bg-[var(--tint,var(--acc))]" style={iconTint ? { '--tint': iconTint } : null}><Icon name={icon} /></span>}
      <span className="flex-1 min-w-0 flex flex-col gap-px">
        <span className="text-[17px] tracking-[-.012em] leading-[1.25]">{title}</span>
        {subtitle && <span className="text-[13px] text-label-2 leading-[1.3]">{subtitle}</span>}
      </span>
      {children}
      {value != null && <span className="text-label-2 text-[17px] tracking-[-.012em] shrink-[1] grow-0 basis-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right">{value}</span>}
      {accessory === 'chevron' && <Icon name="chevronRight" className="text-label text-[15px] shrink-0 [--icon-stroke:2.4]" />}
      {accessory === 'check' && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}
    </Tag>
  )
}

/* ============================ picker ============================ */

// Replaces <select>. A native select opens a system list that ignores the app's
// theme entirely — on dark mode it flashes a white sheet — and can't show more
// than a bare label per option. This opens our own sheet with a checkmark on the
// current value, which is also how iOS itself handles a long option list.
export function SelectRow({ icon, iconTint, title, value, options, onChange, sheetTitle }) {
  const cur = options.find(o => o.value === value)
  const open = () => {
    const { openSheet } = require_ui()
    const h = openSheet(close => (
      <>
        <h3 className="text-[20px] font-semibold tracking-[-.021em] mb-3.5">{sheetTitle || title}</h3>
        <div className="bg-surface rounded-[14px] overflow-hidden">
          {options.map(o => (
            <button key={o.value} className="lrow relative flex items-center gap-3 w-full text-left px-3.5 py-[11px] min-h-[46px] text-label bg-transparent no-tap active:bg-surface-2" onClick={() => { close(); onChange(o.value) }}>
              <span className="flex-1 min-w-0 flex flex-col gap-px">
                <span className="text-[17px] tracking-[-.012em] leading-[1.25]">{o.label}</span>
                {o.subtitle && <span className="text-[13px] text-label-2 leading-[1.3]">{o.subtitle}</span>}
              </span>
              {o.value === value && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}
            </button>
          ))}
        </div>
        <div className="h-2" />
      </>
    ))
    return h
  }
  return (
    <Row icon={icon} iconTint={iconTint} title={title} value={cur ? cur.label : value} accessory="chevron" onClick={open} />
  )
}

// Late import keeps this module free of a cycle at load time (useUI pulls in the
// store, which pulls in helpers that import controls).
let _ui = null
export function bindUI(store) { _ui = store }
function require_ui() {
  if (!_ui) throw new Error('ui store not bound — call bindUI(useUI) once at boot')
  return _ui.getState()
}

/* ============================ buttons ============================ */

export function Button({ variant = 'plain', size, icon, trailingIcon, children, className = '', ...rest }) {
  const base =
    'inline-flex items-center justify-center no-tap transition-[transform,background-color,opacity] duration-150 ease-[var(--ease)] active:scale-[.975] disabled:opacity-30 disabled:pointer-events-none ' +
    (size === 'xs' ? 'w-auto px-[10px] py-[5px] text-[13px] rounded-[7px] gap-1 ' :
      size === 'sm' ? 'w-auto px-[14px] py-2 text-[15px] rounded-lg gap-[5px] ' :
        'w-full px-[18px] py-[14px] text-[17px] font-semibold tracking-[-.012em] rounded-xl gap-[7px] ')
  const look = {
    primary: 'bg-acc text-on-acc active:bg-acc-2',
    tinted: 'bg-acc-soft text-acc',
    danger: 'bg-[color-mix(in_srgb,var(--red)_15%,transparent)] text-red',
    ghost: 'bg-transparent text-acc font-normal active:bg-surface-2',
    plain: 'bg-transparent text-acc font-normal active:bg-surface-2',
  }[variant] || 'bg-surface-2 text-label'
  const icnSize = size === 'xs' ? 'text-[13px]' : size === 'sm' ? 'text-[16px]' : 'text-[19px]'
  return (
    <button className={`${base} ${look} ${className}`} {...rest}>
      {icon && <Icon name={icon} className={icnSize} />}
      {/* inline-flex: callers like BusyBtn put their own icon inside children */}
      {children && <span className="inline-flex items-center gap-[inherit] min-w-0">{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} className={icnSize} />}
    </button>
  )
}

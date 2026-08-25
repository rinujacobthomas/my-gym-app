import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useUI } from '../store/useUI.js'
import { isoOf, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const AV_COLORS = ['var(--blue)', 'var(--teal)', 'var(--purple)', 'var(--pink)', 'var(--orange)', 'var(--mint)', 'var(--indigo)']

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
const avColor = name => AV_COLORS[((name || '?').charCodeAt(0) || 0) % AV_COLORS.length]

const nextDateFor = wd => {
  const d = new Date()
  d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7))
  return isoOf(d)
}

function TrainerCard({ tr, open, onToggle, onBook }) {
  const byWd = new Map()
  ;(tr.availability || []).forEach(w => {
    if (!byWd.has(w.weekday)) byWd.set(w.weekday, [])
    byWd.get(w.weekday).push(w)
  })
  ;[...byWd.values()].forEach(list => list.sort((a, b) => a.startMin - b.startMin))
  const any = [...byWd.values()].some(l => l.length)

  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <button className="w-full flex items-center gap-3 text-left no-tap" onClick={onToggle}>
      <span className="w-[46px] h-[46px] rounded-full shrink-0 text-[19px] font-semibold text-white flex items-center justify-center" style={{ background: avColor(tr.name) }}>
        {(tr.name || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[18px] font-semibold tracking-[-.012em] leading-[1.2] truncate">{tr.name}</span>
        {!!tr.bufferMin && <span className="block text-label-3 text-[13px] leading-[1.3] mt-0.5">{t('{0} min buffer between sessions', tr.bufferMin)}</span>}
      </span>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-label-3 text-[16px] shrink-0" />
    </button>

    {tr.bio && <div className="text-label-2 text-[13px] leading-[1.38] mt-2">{tr.bio}</div>}

    {Array.isArray(tr.specialties) && tr.specialties.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {tr.specialties.map(s => <span key={s} className="text-[12px] px-[9px] py-1 rounded-full bg-surface-2 text-label-2">{s}</span>)}
      </div>
    )}

    {open && (any
      ? WEEK_ORDER.filter(wd => (byWd.get(wd) || []).length).map(wd => {
        const date = nextDateFor(wd)
        return <div key={wd} className="mt-3 first:mt-3">
          <div className="text-[13px] text-label-2 mb-1.5">{WD[wd]} <span className="text-label-3">· {fmtDate(date, true)}</span></div>
          <div className="flex flex-wrap gap-1.5">
            {(byWd.get(wd) || []).map((w, i) => (
              <button key={i} onClick={() => onBook(tr, w)}
                className="px-3 py-[6px] rounded-lg text-[14px] font-medium bg-acc-soft text-acc transition-transform duration-150 active:scale-95 no-tap">
                {hhmm(w.startMin)} – {hhmm(w.endMin)}
              </button>
            ))}
          </div>
        </div>
      })
      : <div className="text-label-3 text-[13px] leading-[1.38] mt-3">{t('No public hours right now — message the desk to arrange a session.')}</div>)}
  </div>
}

export default function Trainers() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const trainersQ = useQuery({ queryKey: qk.trainers, queryFn: () => api('/api/trainers') })
  const ptQ = useQuery({ queryKey: qk.ptBookings, queryFn: () => api('/api/pt/bookings') })
  const [openId, setOpenId] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const trainers = trainersQ.data || []
  const nameOf = id => { const tr = trainers.find(x => x.id === id); return tr ? tr.name : t('Trainer') }

  const bookWindow = (tr, win) => {
    const date = nextDateFor(win.weekday)
    confirmSheet({
      title: t('Book {0}?', tr.name),
      message: t('{0} · {1} – {2}', fmtDate(date, true), hhmm(win.startMin), hhmm(win.endMin)),
      confirmText: t('Book session'),
      onConfirm: async () => {
        try {
          await api('/api/pt/bookings', { method: 'POST', body: JSON.stringify({ trainerId: tr.id, date, startMin: win.startMin, endMin: win.endMin }) })
          toast(t('Session booked 💪'))
          qc.invalidateQueries({ queryKey: qk.ptBookings })
        } catch (e) {
          toast(e.status === 409 ? t('Time just got taken') : t('Could not book: {0}', e.message))
        }
      },
    })
  }

  const cancelSession = b => confirmSheet({
    title: t('Cancel this session?'),
    message: t('{0} · {1} · {2} – {3}', nameOf(b.trainerId), fmtDate(b.date, true), hhmm(b.startMin), hhmm(b.endMin)),
    confirmText: t('Cancel session'), danger: true,
    onConfirm: async () => {
      if (busyId === b.id) return
      setBusyId(b.id)
      try { await api('/api/pt/' + b.id + '/cancel', { method: 'POST' }); toast(t('Session cancelled')); qc.invalidateQueries({ queryKey: qk.ptBookings }) }
      catch (e) { toast(t('Could not cancel: {0}', e.message)) }
      finally { setBusyId(null) }
    },
  })

  const sessions = (ptQ.data || []).slice().sort((a, b) =>
    (b.date + hhmm(b.startMin)).localeCompare(a.date + hhmm(a.startMin)))

  return <div>
    <div className="flex items-end gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Trainers')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Book a personal session')}</div>
      </div>
    </div>

    {trainersQ.isPending && <>
      <div className="h-28 bg-surface rounded-xl animate-pulse mb-2" />
      <div className="h-28 bg-surface rounded-xl animate-pulse mb-2" />
    </>}

    {trainersQ.error && !trainersQ.isPending && <div className="bg-surface rounded-[14px] p-5 text-center">
      <div className="text-label-2 text-[13px] mb-2.5">{t('Could not load the trainer directory.')}</div>
      <button className="inline-flex items-center gap-[5px] px-[14px] py-2 rounded-lg bg-acc-soft text-acc text-[15px] no-tap active:scale-[.975] transition-transform duration-150" onClick={() => trainersQ.refetch()}>
        <Icon name="reset" className="text-[16px]" />{t('Retry')}
      </button>
    </div>}

    {!trainersQ.isPending && !trainersQ.error && !trainers.length && <div className="bg-surface rounded-[14px] p-8 text-center">
      <Icon name="personCircle" className="text-[30px] text-label-3 mx-auto" />
      <div className="text-[17px] font-semibold tracking-[-.012em] mt-2">{t('No trainers listed yet')}</div>
      <div className="text-label-2 text-[13px] leading-[1.38] mt-1 max-w-[300px] mx-auto">{t('Our coaching team is being set up — check back soon.')}</div>
    </div>}

    {!trainersQ.isPending && !trainersQ.error && trainers.length > 0 &&
      <div className="desk:grid desk:grid-cols-2 desk:gap-3 desk:items-start">
        {trainers.map(tr => (
          <TrainerCard key={tr.id} tr={tr} open={openId === tr.id}
            onToggle={() => setOpenId(openId === tr.id ? null : tr.id)} onBook={bookWindow} />
        ))}
      </div>}

    <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px] mt-6">{t('My PT sessions')}</h2>
    <div className="bg-surface rounded-[14px] overflow-hidden mb-3">
      {sessions.length ? sessions.map(b => {
        const cancelled = String(b.status || '').toUpperCase() === 'CANCELLED'
        return <div key={b.id} className={'lrow relative flex items-center gap-3 px-3.5 py-[11px] min-h-[56px]' + (cancelled ? ' opacity-50' : '')}>
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white" style={{ background: avColor(nameOf(b.trainerId)) }}>
            <Icon name="dumbbell" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] tracking-[-.012em] leading-[1.25] truncate">{nameOf(b.trainerId)}</div>
            <div className="text-label-2 text-[13px] leading-[1.3] mt-px">{fmtDate(b.date, true)} · {hhmm(b.startMin)} – {hhmm(b.endMin)}</div>
          </div>
          {cancelled
            ? <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 bg-surface-2 text-label-3">{t('Cancelled')}</span>
            : <button className="shrink-0 px-3 py-[5px] rounded-lg text-[14px] text-red bg-[color-mix(in_srgb,var(--red)_15%,transparent)] no-tap active:opacity-50 disabled:opacity-30" disabled={busyId === b.id} onClick={() => cancelSession(b)}>{busyId === b.id ? t('…') : t('Cancel')}</button>}
        </div>
      }) : <div className="px-3.5 py-5 text-center">
        <Icon name="calendar" className="text-[24px] text-label-3 mx-auto" />
        <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5">{ptQ.isPending ? t('Loading…') : t('No sessions yet — tap a free window above to book one.')}</div>
      </div>}
    </div>

    <div className="h-2" />
  </div>
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useUI } from '../store/useUI.js'
import { isoOf, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

const AV_COLORS = ['var(--blue)', 'var(--teal)', 'var(--purple)', 'var(--pink)', 'var(--orange)', 'var(--mint)', 'var(--indigo)']

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
const avColor = name => AV_COLORS[((name || '?').charCodeAt(0) || 0) % AV_COLORS.length]

const SESSION_MIN = 60

// Bookable sessions for the next 7 days: each public window cut into 1-hour sessions,
// minus anything already taken (plus the coach's buffer) and anything starting too soon.
// Availability weekdays come from the API as Mon=0 … Sun=6.
function freeSessions(tr) {
  const out = []
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const buf = tr.bufferMin || 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i)
    const iso = isoOf(d)
    const srvWd = (d.getDay() + 6) % 7
    const taken = (tr.booked || []).filter(b => b.date === iso)
    const slots = []
    for (const w of (tr.availability || []).filter(a => a.weekday === srvWd)) {
      const len = Math.min(SESSION_MIN, w.endMin - w.startMin)
      // step by session + buffer so back-to-back times shown can all be booked
      for (let st = w.startMin; st + len <= w.endMin; st += SESSION_MIN + buf) {
        const en = st + len
        if (i === 0 && st < nowMin + 30) continue
        if (taken.some(b => st < b.endMin + buf && b.startMin < en + buf)) continue
        slots.push({ startMin: st, endMin: en })
      }
    }
    if (slots.length) out.push({ iso, slots })
  }
  return out
}

function TrainerCard({ tr, open, onToggle, onBook }) {
  const days = tr.id ? freeSessions(tr) : []

  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <button className="w-full flex items-center gap-3 text-left no-tap" onClick={onToggle}>
      <span className="w-[46px] h-[46px] rounded-full shrink-0 text-[19px] font-semibold text-white flex items-center justify-center" style={{ background: avColor(tr.name) }}>
        {(tr.name || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[18px] font-semibold tracking-[-.012em] leading-[1.2] truncate">{tr.name}</span>
        <span className="block text-label-3 text-[13px] leading-[1.3] mt-0.5">
          {days.length ? t('{0} free sessions this week', days.reduce((n, d) => n + d.slots.length, 0)) : t('No free sessions this week')}
        </span>
      </span>
      <span className="text-acc text-[14px] font-semibold shrink-0">{open ? t('Hide') : t('See times')}</span>
    </button>

    {tr.bio && <div className="text-label-2 text-[13px] leading-[1.38] mt-2">{tr.bio}</div>}

    {Array.isArray(tr.specialties) && tr.specialties.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {tr.specialties.map(s => <span key={s} className="text-[12px] px-[9px] py-1 rounded-full bg-surface-2 text-label-2">{s}</span>)}
      </div>
    )}

    {open && (days.length
      ? days.map(d => <div key={d.iso} className="mt-3">
          <div className="text-[13px] text-label-2 mb-1.5">{d.iso === isoOf(new Date()) ? t('Today') : fmtDate(d.iso, true)}</div>
          <div className="flex flex-wrap gap-1.5">
            {d.slots.map(w => (
              <button key={w.startMin} onClick={() => onBook(tr, d.iso, w)}
                className="px-3 py-[6px] rounded-lg text-[14px] font-medium bg-acc-soft text-acc transition-transform duration-150 active:scale-95 no-tap">
                {hhmm(w.startMin)}
              </button>
            ))}
          </div>
        </div>)
      : <div className="text-label-3 text-[13px] leading-[1.38] mt-3">{t('No free sessions in the next 7 days — ask at the front desk to arrange one.')}</div>)}
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
  const nameOf = b => (b.trainer && b.trainer.name) || t('Trainer')

  const bookWindow = (tr, date, win) => {
    confirmSheet({
      title: t('Book {0}?', tr.name),
      message: t('{0} · {1} – {2}', fmtDate(date, true), hhmm(win.startMin), hhmm(win.endMin)),
      confirmText: t('Book session'),
      onConfirm: async () => {
        try {
          await api('/api/pt/bookings', { method: 'POST', body: JSON.stringify({ trainerId: tr.id, date, startMin: win.startMin, endMin: win.endMin }) })
          toast(t('Session booked 💪'))
          qc.invalidateQueries({ queryKey: qk.ptBookings })
          qc.invalidateQueries({ queryKey: qk.trainers })
        } catch (e) {
          toast(e.status === 409 ? t('Time just got taken') : t('Could not book: {0}', e.message))
        }
      },
    })
  }

  const cancelSession = b => confirmSheet({
    title: t('Cancel this session?'),
    message: t('{0} · {1} · {2} – {3}', nameOf(b), fmtDate(b.date, true), hhmm(b.startMin), hhmm(b.endMin)),
    confirmText: t('Cancel session'), danger: true,
    onConfirm: async () => {
      if (busyId === b.id) return
      setBusyId(b.id)
      try { await api('/api/pt/' + b.id + '/cancel', { method: 'POST' }); toast(t('Session cancelled')); qc.invalidateQueries({ queryKey: qk.ptBookings }); qc.invalidateQueries({ queryKey: qk.trainers }) }
      catch (e) { toast(t('Could not cancel: {0}', e.message)) }
      finally { setBusyId(null) }
    },
  })

  // The API returns upcoming sessions first (soonest first), then past ones (latest first).
  const sessions = (ptQ.data || []).slice(0, 20)

  return <div>
    <div className="flex items-end gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Coaches')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Book a 1-on-1 training session')}</div>
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

    <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px] mt-6">{t('My 1-on-1 sessions')}</h2>
    <div className="bg-surface rounded-[14px] overflow-hidden mb-3">
      {sessions.length ? sessions.map(b => {
        const status = String(b.status || '').toUpperCase()
        const cancelled = status === 'CANCELLED'
        const upcoming = status === 'BOOKED' && String(b.date).slice(0, 10) >= isoOf(new Date())
        return <div key={b.id} className={'lrow relative flex items-center gap-3 px-3.5 py-[11px] min-h-[56px]' + (cancelled ? ' opacity-50' : '')}>
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white" style={{ background: avColor(nameOf(b)) }}>
            <Icon name="dumbbell" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] tracking-[-.012em] leading-[1.25] truncate">{nameOf(b)}</div>
            <div className="text-label-2 text-[13px] leading-[1.3] mt-px">{fmtDate(b.date, true)} · {hhmm(b.startMin)} – {hhmm(b.endMin)}</div>
          </div>
          {!upcoming
            ? <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 bg-surface-2 text-label-3">{t(cancelled ? 'Cancelled' : status === 'COMPLETED' ? 'Done' : status === 'NO_SHOW' ? 'Missed' : 'Past')}</span>
            : <button className="shrink-0 px-3 py-[5px] rounded-lg text-[14px] text-red bg-[color-mix(in_srgb,var(--red)_15%,transparent)] no-tap active:opacity-50 disabled:opacity-30" disabled={busyId === b.id} onClick={() => cancelSession(b)}>{busyId === b.id ? t('…') : t('Cancel')}</button>}
        </div>
      }) : <div className="px-3.5 py-5 text-center">
        <Icon name="calendar" className="text-[24px] text-label-3 mx-auto" />
        <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5">{ptQ.isPending ? t('Loading…') : t('No sessions yet — open a coach above and tap a time to book.')}</div>
      </div>}
    </div>

    <div className="h-2" />
  </div>
}

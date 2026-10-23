import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useUI } from '../store/useUI.js'
import { todayISO, isoOf, fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Section, Switch } from '../components/ui.jsx'

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
// The API numbers weekdays Mon=0 … Sun=6; WD above is JS getDay() order (Sun=0).
const srvDay = wd => (wd + 6) % 7

// Same rule as the API: a slot takes bookings until 15 minutes before it ends.
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }

const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')

const chipCls = {
  BOOKED: 'bg-[color-mix(in_srgb,var(--green)_16%,transparent)] text-green',
  WAITLISTED: 'bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)] text-yellow',
}
const Chip = ({ s }) => (
  <span className={'inline-flex items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 ' + (chipCls[s] || 'bg-surface-2 text-label-2')}>{t(s === 'BOOKED' ? 'Booked' : s === 'WAITLISTED' ? 'Waitlisted' : s === 'CANCELLED' ? 'Cancelled' : s)}</span>
)

function Capacity({ slot }) {
  if (slot.capacity > 20) {
    const pct = slot.capacity ? Math.min(100, Math.round((slot.booked / slot.capacity) * 100)) : 0
    return <div className="flex items-center gap-2 flex-1 min-w-0">
      <span className="h-[6px] rounded-full bg-surface-2 overflow-hidden flex-1"><span className="block h-full rounded-full bg-acc" style={{ width: pct + '%' }} /></span>
      <span className="text-[12px] text-label-2 shrink-0">{slot.booked}/{slot.capacity}</span>
    </div>
  }
  return <div className="flex items-center gap-[3px] flex-wrap flex-1 min-w-0">
    {Array.from({ length: slot.capacity }, (_, i) => <span key={i} className={'w-[6px] h-[6px] rounded-full ' + (i < slot.booked ? 'bg-acc' : 'bg-surface-3')} />)}
    <span className="text-[12px] text-label-2 ml-1.5 shrink-0">{slot.booked}/{slot.capacity}</span>
  </div>
}

function SlotCard({ slot, myBooking, closed, onBook, onCancel, onJoinWl, onLeaveWl }) {
  const mine = slot.mine
  const booked = mine && mine.status !== 'CANCELLED'
  const waitlisted = slot.waitlistPosition != null || slot._wlPending
  return <div className="bg-surface rounded-[14px] p-4 mb-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[17px] font-medium tracking-[-.012em] leading-[1.25]">{hhmm(slot.startMin)} – {hhmm(slot.endMin)}</div>
        <div className="text-label-2 text-[13px] leading-[1.38] mt-0.5">{slot.name}</div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        {booked && <Chip s={mine.status === 'BOOKED' || !mine.status ? 'BOOKED' : mine.status} />}
        {!booked && closed && <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium text-label-3 bg-surface-2">{t('Closed')}</span>}
        {!booked && !closed && slot.full && <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium text-red bg-[color-mix(in_srgb,var(--red)_15%,transparent)]">{t('FULL')}</span>}
        {waitlisted && !booked && (slot.waitlistPosition != null
          ? <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium text-yellow bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)]">#{slot.waitlistPosition} · {t('in line')}</span>
          : <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium text-label-3 bg-surface-2">{t('Joining…')}</span>)}
      </div>
    </div>
    <div className="flex items-center gap-2 mt-2.5"><Capacity slot={slot} /></div>
    {!booked && !closed && !slot.full && slot.walkInRemaining > 0 && (
      <div className="text-label-3 text-[13px] leading-[1.38] mt-1.5">{t('{0} spots left', slot.walkInRemaining)}</div>
    )}
    {!(closed && !booked) && <div className="flex gap-2 mt-3">
      {booked && myBooking && myBooking.status === 'CHECKED_IN'
        ? <span className="text-[13px] text-green font-medium">{t('Checked in')}</span>
        : booked
        ? <Button size="sm" variant="danger" onClick={() => onCancel(slot)}>{t('Cancel booking')}</Button>
        : <>
          {!slot.full && !waitlisted && <Button size="sm" variant="primary" onClick={() => onBook(slot)}>{t('Book')}</Button>}
          {slot.full && !waitlisted && <Button size="sm" variant="tinted" onClick={() => onJoinWl(slot)}>{t('Join waitlist')}</Button>}
          {waitlisted && <Button size="sm" onClick={() => onLeaveWl(slot)}>{t('Leave waitlist')}</Button>}
        </>}
    </div>}
  </div>
}

export default function Book() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const [iso, setIso] = useState(todayISO())
  const slotsQ = useQuery({ queryKey: qk.slots(iso), queryFn: () => api('/api/slots?date=' + iso) })
  const bookingsQ = useQuery({ queryKey: qk.myBookings, queryFn: () => api('/api/bookings/me') })
  const timesQ = useQuery({ queryKey: qk.slots(todayISO()), queryFn: () => api('/api/slots?date=' + todayISO()) })
  const patternsQ = useQuery({ queryKey: qk.patterns, queryFn: () => api('/api/bookings/patterns') })
  const busy = useRef(false)

  // the optimistic patch + rollback pair below needs the exact list it is mutating
  const setSlot = (id, mut) => qc.setQueryData(qk.slots(iso), d => d && d.map(s => s.id === id ? mut(s) : s))

  const days = useMemo(() => {
    const base = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i)
      return { iso: isoOf(d), wd: d.getDay(), num: d.getDate() }
    })
  }, [])

  const slots = slotsQ.data || []
  const myBookings = bookingsQ.data || []
  const bookingFor = slot => slot.mine ? myBookings.find(b => b.id === slot.mine.bookingId) : null

  const book = async slot => {
    if (busy.current) return
    busy.current = true
    const snap = slot
    setSlot(slot.id, s => ({ ...s, booked: s.booked + 1, full: s.booked + 1 >= s.capacity, mine: { bookingId: 'pending', status: 'BOOKED' }, waitlistPosition: null }))
    try {
      const res = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ slotId: slot.id }) })
      const bk = res && res.booking
      setSlot(snap.id, s => ({ ...s, mine: { bookingId: bk ? bk.id : 'pending', status: bk ? bk.status : 'BOOKED' }, _wlPending: false }))
      toast(t('Booked — see you there 💪'))
      qc.invalidateQueries({ queryKey: ['slots'] })
      qc.invalidateQueries({ queryKey: qk.myBookings })
    } catch (e) {
      setSlot(snap.id, () => snap)
      toast(e.status === 409 ? t('That slot just filled up — grab another one.') : t('Could not book: {0}', e.message))
    } finally { busy.current = false }
  }

  const cancelSlotBooking = slot => {
    const bid = slot.mine && slot.mine.bookingId
    const rec = myBookings.find(b => b.id === bid)
    if (rec && rec.canCancel === false) { toast(t('This slot has already ended.')); return }
    confirmSheet({
      title: t('Cancel this booking?'),
      message: t('{0} · {1} – {2}', fmtDate(iso, true), hhmm(slot.startMin), hhmm(slot.endMin)),
      confirmText: t('Cancel booking'), danger: true,
      onConfirm: async () => {
        const snap = slot
        setSlot(slot.id, s => ({ ...s, booked: Math.max(0, s.booked - 1), full: false, mine: null }))
        try {
          await api('/api/bookings/' + bid + '/cancel', { method: 'POST' })
          toast(t('Booking cancelled'))
          qc.invalidateQueries({ queryKey: qk.myBookings })
          qc.invalidateQueries({ queryKey: ['slots'] })
        } catch (e) {
          setSlot(snap.id, () => snap)
          toast(e.status === 409 ? t('Too late to self-cancel — cutoff passed.') : t('Could not cancel: {0}', e.message))
        }
      },
    })
  }

  const joinWl = async slot => {
    const snap = slot
    setSlot(slot.id, s => ({ ...s, _wlPending: true }))
    try {
      await api('/api/slots/' + slot.id + '/waitlist', { method: 'POST' })
      await slotsQ.refetch()
      toast(t('You are on the waitlist — we will ping you if a spot opens'))
    } catch (e) {
      setSlot(snap.id, s => ({ ...s, _wlPending: false }))
      toast(e.status === 409 ? t('You are already on this waitlist.') : t('Could not join the waitlist: {0}', e.message))
    }
  }

  const leaveWl = async slot => {
    const snap = slot
    setSlot(slot.id, s => ({ ...s, waitlistPosition: null }))
    try {
      await api('/api/slots/' + slot.id + '/waitlist', { method: 'DELETE' })
      qc.invalidateQueries({ queryKey: ['slots'] })
      toast(t('Left the waitlist'))
    } catch (e) {
      setSlot(snap.id, () => snap)
      toast(t('Could not leave the waitlist: {0}', e.message))
    }
  }

  const timeOpts = useMemo(() => {
    const seen = new Map()
    ;(timesQ.data || []).forEach(s => {
      const k = s.startMin + '-' + s.endMin
      if (!seen.has(k)) seen.set(k, { startMin: s.startMin, endMin: s.endMin })
    })
    return [...seen.values()].sort((a, b) => a.startMin - b.startMin)
  }, [timesQ.data])

  // GET returns a plain array; PUT replaces the whole set, so every save must send all days.
  const patterns = Array.isArray(patternsQ.data) ? patternsQ.data : []
  const patOf = wd => patterns.find(p => p.weekday === srvDay(wd))

  const savePat = next => {
    qc.setQueryData(qk.patterns, next)
    api('/api/bookings/patterns', { method: 'PUT', body: JSON.stringify({ patterns: next }) })
      .catch(() => { qc.invalidateQueries({ queryKey: qk.patterns }); toast(t('Could not save auto-book settings')) })
  }

  const toggleDay = wd => {
    const cur = patOf(wd)
    savePat(cur
      ? patterns.map(p => p.weekday === srvDay(wd) ? { ...p, active: !p.active } : p)
      : [...patterns, { weekday: srvDay(wd), startMin: timeOpts[0] ? timeOpts[0].startMin : 0, endMin: timeOpts[0] ? timeOpts[0].endMin : 0, active: true }])
  }

  const setTimeFor = (wd, o) => savePat(patterns.map(p => p.weekday === srvDay(wd) ? { ...p, startMin: o.startMin, endMin: o.endMin, active: true } : p))

  // canCancel is the server's "booked and not over yet" — past visits and no-shows stay out.
  const upcoming = myBookings
    .filter(b => b.status === 'BOOKED' && b.canCancel)
    .sort((a, b) => ((a.slot.date + hhmm(a.slot.startMin)) < (b.slot.date + hhmm(b.slot.startMin)) ? -1 : 1))

  return <div>
    <div className="flex items-end gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Book a slot')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{fmtDate(iso, true)}</div>
      </div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/qr')} aria-label={t('Check-in QR')}><Icon name="key" /></button>
    </div>

    <div className="flex gap-1.5 overflow-x-auto no-tap mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map(d => (
        <button key={d.iso} onClick={() => setIso(d.iso)}
          className={'shrink-0 w-[52px] py-2 rounded-xl text-center transition-colors duration-150 no-tap ' + (d.iso === iso ? 'bg-acc text-on-acc' : 'bg-surface text-label active:bg-surface-2')}>
          <div className={'text-[11px] uppercase tracking-[.03em] ' + (d.iso === iso ? 'opacity-80' : 'text-label-3')}>{WD[d.wd]}</div>
          <div className="text-[19px] font-semibold tracking-[-.02em] leading-tight mt-0.5">{d.num}</div>
        </button>
      ))}
    </div>

    {slotsQ.isPending && <>
      <div className="h-16 bg-surface rounded-xl animate-pulse mb-2" />
      <div className="h-16 bg-surface rounded-xl animate-pulse mb-2" />
      <div className="h-16 bg-surface rounded-xl animate-pulse mb-2" />
    </>}

    {slotsQ.error && !slotsQ.isPending && <div className="bg-surface rounded-[14px] p-5 text-center mb-2">
      <Icon name="clock" className="text-[26px] text-label-3" />
      <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5 mb-3">{t('Could not load slots for this day.')}</div>
      <Button size="sm" variant="tinted" icon="reset" onClick={() => slotsQ.refetch()}>{t('Retry')}</Button>
    </div>}

    {!slotsQ.isPending && !slotsQ.error && !slots.length && <div className="bg-surface rounded-[14px] p-6 text-center mb-2">
      <Icon name="calendar" className="text-[28px] text-label-3" />
      <div className="text-label-2 text-[13px] leading-[1.38] mt-2">{t('No slots posted for this day yet — check back soon or pick another day.')}</div>
    </div>}

    {!slotsQ.isPending && !slotsQ.error && slots.map(s => (
      <SlotCard key={s.id} slot={s} myBooking={bookingFor(s)} closed={iso === todayISO() && s.endMin <= nowMin() + 15}
        onBook={book} onCancel={cancelSlotBooking} onJoinWl={joinWl} onLeaveWl={leaveWl} />
    ))}

    <Section title={t('My upcoming bookings')} className="mt-5"
      footer={upcoming.length ? t('Show the check-in QR at the desk when you walk in.') : null}>
      {upcoming.length ? upcoming.map(b => (
        <div key={b.id} className="flex items-center gap-3 px-3.5 py-[11px] min-h-[56px]">
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white bg-green"><Icon name="check" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[17px] tracking-[-.012em] leading-[1.25] truncate">{fmtDate(b.slot.date, true)} · {hhmm(b.slot.startMin)} – {hhmm(b.slot.endMin)}</div>
          </div>
          <Chip s={b.status || 'BOOKED'} />
          <button className="rounded-full shrink-0 bg-surface-2 text-label w-9 h-9 flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-3 active:scale-90 no-tap" onClick={() => nav('/qr')} aria-label={t('Check-in QR')}><Icon name="key" /></button>
        </div>
      )) : <div className="px-3.5 py-5 text-center">
        <Icon name="calendar" className="text-[24px] text-label-3 mx-auto" />
        <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5">{t('Nothing booked yet — grab a slot above.')}</div>
      </div>}
    </Section>

    <Section title={t('Weekly auto-book')}
      footer={t('Turn on the days you usually train and pick a time. Every night we book that time for the next day, if there is room.')}>
      {WEEK_ORDER.map(wd => {
        const pat = patOf(wd)
        const on = !!(pat && pat.active)
        return <div key={wd}>
          <Row2 title={WD[wd]} on={on} onToggle={() => toggleDay(wd)} disabled={!patterns.length && !pat && !timeOpts.length} />
          {on && timeOpts.length > 0 && <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 -mt-1">
            {timeOpts.map(o => {
              const sel = pat && pat.startMin === o.startMin && pat.endMin === o.endMin
              return <button key={o.startMin + '-' + o.endMin} onClick={() => setTimeFor(wd, o)}
                className={'px-3 py-[6px] rounded-lg text-[14px] font-medium transition-colors duration-150 no-tap ' + (sel ? 'bg-acc text-on-acc' : 'bg-surface-2 text-label-2 active:bg-surface-3')}>
                {hhmm(o.startMin)}
              </button>
            })}
          </div>}
        </div>
      })}
    </Section>

    <div className="h-2" />
  </div>
}

function Row2({ title, on, onToggle, disabled }) {
  return <div className="lrow relative flex items-center gap-3 w-full px-3.5 py-[11px] min-h-[46px]">
    <span className="flex-1 min-w-0 text-[17px] tracking-[-.012em] leading-[1.25]">{title}</span>
    <Switch checked={on} onChange={onToggle} disabled={disabled} />
  </div>
}

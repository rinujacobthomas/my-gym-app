import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSlots, slotAttendees, qk } from '@og/api-client'
import { todayISO, isoOf, fmtDate } from '@og/core'
import Icon from '@og/ui'
import { PageHead, Empty, SkelList, Stat, StatusDot, useTick, minToT, clockOf, nowMin, durTxt, errText, toast } from '../components/bits.jsx'

const shiftISO = (iso, days) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

const selectDay = list => {
  let booked = 0, cap = 0
  for (const s of list) { booked += s.booked; cap += s.capacity }
  return { list, booked, cap }
}

export default function Today() {
  const [date, setDate] = useState(todayISO())
  const [openId, setOpenId] = useState(null)

  const dayQ = useQuery({ queryKey: qk.slots(date), queryFn: () => getSlots(date), select: selectDay })
  const attQ = useQuery({
    queryKey: ['attendees', openId],
    queryFn: () => slotAttendees(openId),
    enabled: !!openId,
    refetchInterval: 15000,
  })

  useEffect(() => { if (dayQ.error) toast(errText(dayQ.error)) }, [dayQ.error])
  useEffect(() => { if (attQ.error) toast(errText(attQ.error)) }, [attQ.error])
  useEffect(() => { setOpenId(null) }, [date])

  useTick(30000)

  const slots = dayQ.data?.list
  const isToday = date === todayISO()
  const nm = nowMin()

  const live = useMemo(() => (slots || []).find(s => s.startMin <= nm && nm < s.endMin), [slots, nm])
  const next = useMemo(() => (slots || []).find(s => s.startMin > nm), [slots, nm])
  const openSlot = (slots || []).find(s => s.id === openId) || null

  const cinNow = useMemo(() => {
    if (!isToday || !live || live.id !== openId || !attQ.data) return null
    return attQ.data.attendees.filter(a => a.status === 'CHECKED_IN').length
  }, [isToday, live, openId, attQ.data])

  const dayLabel = fmtDate(date, true)
  const weekday = new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' })

  return (
    <div>
      <PageHead title="Today" sub={isToday ? weekday : dayLabel} />

      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setDate(d => shiftISO(d, -1))} aria-label="Previous day"
          className="w-10 h-10 rounded-full bg-surface text-label flex items-center justify-center no-tap active:bg-surface-2 active:scale-90 transition-[background-color,transform] duration-150">
          <Icon name="chevronLeft" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-label-2 text-[13px] text-center">{dayLabel}</div>
          {!isToday && (
            <button onClick={() => setDate(todayISO())}
              className="block mx-auto mt-[2px] text-acc text-[13px] font-medium bg-transparent border-0 no-tap active:opacity-60">
              Back to today
            </button>
          )}
        </div>
        <button onClick={() => setDate(d => shiftISO(d, 1))} aria-label="Next day"
          className="w-10 h-10 rounded-full bg-surface text-label flex items-center justify-center no-tap active:bg-surface-2 active:scale-90 transition-[background-color,transform] duration-150">
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <Stat label="Booked" value={dayQ.isPending ? '—' : dayQ.data.booked} sub={'of ' + dayQ.data.cap + ' spaces'} />
        {isToday ? (
          <>
            <Stat label="In gym now" value={cinNow ?? '—'} tone={cinNow ? 'green' : undefined} />
            <Stat
              label={live ? 'Live slot' : 'Next slot'}
              value={live ? minToT(live.startMin) : next ? minToT(next.startMin) : '—'}
              sub={live ? 'ends in ' + durTxt(live.endMin - nm) : next ? 'in ' + durTxt(next.startMin - nm) : 'no more slots'} />
          </>
        ) : (
          <Stat label="Capacity" value={dayQ.isPending ? '—' : (dayQ.data.cap ? Math.round(dayQ.data.booked / dayQ.data.cap * 100) + '%' : '—')} sub="booked" />
        )}
      </div>

      {dayQ.isPending ? (
        <SkelList n={5} h={76} />
      ) : !slots?.length ? (
        <Empty icon="calendar" title="No slots scheduled" hint={'The gym has no slots on ' + dayLabel + '. Templates are managed from the admin console.'} />
      ) : (
        slots.map(s => (
          <SlotCard key={s.id} s={s} att={s.id === openId ? attQ.data : undefined}
            open={openId === s.id} onToggle={() => setOpenId(cur => (cur === s.id ? null : s.id))} nowM={nm} />
        ))
      )}

      {openSlot && attQ.data && !attQ.data.attendees?.length && (
        <p className="text-label-3 text-[13px] text-center pt-1">Nobody booked into this slot yet.</p>
      )}
    </div>
  )
}

function SlotCard({ s, att, open, onToggle, nowM }) {
  const pct = Math.min(100, Math.round((s.booked / Math.max(1, s.capacity)) * 100))
  const attendees = att?.attendees || []
  const cin = attendees.filter(a => a.status === 'CHECKED_IN').length
  const past = s.endMin <= nowM
  const running = s.startMin <= nowM && nowM < s.endMin

  return (
    <div className={'bg-surface rounded-[14px] overflow-hidden mb-2 ' + (past ? 'opacity-55' : '')}>
      <button onClick={onToggle}
        className="w-full text-left px-3.5 py-3 flex items-center gap-3 bg-transparent border-0 no-tap active:bg-surface-2 transition-colors duration-150">
        <div className="w-[52px] shrink-0 text-center">
          <div className="text-[16px] font-semibold tracking-[-.02em] tabular-nums leading-none">{minToT(s.startMin)}</div>
          <div className="text-[11px] text-label-3 mt-[3px] tabular-nums">{minToT(s.endMin)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-medium tracking-[-.012em] truncate">{s.name}</span>
            {running && <StatusDot on />}
            {s.full && !past && <span className="shrink-0 bg-surface-3 text-label-2 rounded-md px-[6px] py-[2px] text-[11px] font-medium">FULL</span>}
          </div>
          <div className="h-[4px] rounded-full bg-surface-3 mt-[7px] overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: pct + '%', background: pct >= 100 ? 'var(--orange)' : 'var(--acc)' }} />
          </div>
          <div className="text-[12.5px] text-label-2 mt-[5px] tabular-nums">
            {s.booked}/{s.capacity} booked
            {att ? ' · ' + cin + ' in' : ''}
            {!past && !running ? ' · walk-ins left ' + s.walkInRemaining : ''}
          </div>
        </div>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-label-3 text-[15px] shrink-0 [--icon-stroke:2.4]" />
      </button>

      {open && (
        <div className="border-t-[0.5px] border-sep">
          <div className="flex items-center justify-between px-3.5 py-2 text-[12.5px] text-label-2">
            <span>Attendees</span>
            <span className="tabular-nums">{attendees.length} / {att?.capacity ?? s.capacity}</span>
          </div>
          {!att ? (
            <SkelList n={2} h={44} />
          ) : attendees.length ? (
            attendees.map(a => (
              <div key={a.bookingId} className="lrow relative flex items-center gap-3 px-3.5 py-[10px]">
                <StatusDot on={a.status === 'CHECKED_IN'} />
                <span className="flex-1 min-w-0 text-[15.5px] tracking-[-.012em] truncate">{a.name}</span>
                <span className={'text-[12.5px] font-medium shrink-0 ' + (a.status === 'CHECKED_IN' ? 'text-green' : 'text-label-3')}>
                  {a.status === 'CHECKED_IN' ? 'in at ' + clockOf(a.checkedInAt) : 'not here'}
                </span>
              </div>
            ))
          ) : (
            <div className="text-label-3 text-[13px] px-3.5 pb-3">Empty — no bookings.</div>
          )}
        </div>
      )}
    </div>
  )
}

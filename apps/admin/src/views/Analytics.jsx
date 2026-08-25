import { useState } from 'react'
import { api } from '@og/api-client'
import { useQuery } from '@tanstack/react-query'
import { EXDB, todayISO, MONTHS } from '@og/core'
import Icon, { LineChart } from '@og/ui'
import { hhmm } from '../lib/format.js'
import { PageHead, Empty, Skel, SkelList, ErrorBox, Chip, errText } from '../components/bits.jsx'

const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const shift = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoOf(d) }

export default function Analytics() {
  const [from, setFrom] = useState(() => shift(-29))
  const [to, setTo] = useState(todayISO)

  const attQ = useQuery({
    queryKey: ['admin', 'attendance', { from, to }],
    queryFn: () => api(`/api/admin/attendance?from=${from}&to=${to}`),
  })
  const growthQ = useQuery({
    queryKey: ['admin', 'growth', { months: 6 }],
    queryFn: () => api('/api/admin/members-growth?months=6'),
  })
  const popQ = useQuery({
    queryKey: ['admin', 'popular-exercises', { days: 30 }],
    queryFn: () => api('/api/admin/popular-exercises?days=30'),
  })
  const trainersQ = useQuery({
    queryKey: ['admin', 'trainers'],
    queryFn: () => api('/api/admin/trainers'),
  })

  const att = attQ.isError ? null : attQ.data
  const attErr = attQ.isError ? errText(attQ.error) : null
  const growth = growthQ.isError ? [] : growthQ.data
  const pop = popQ.isError ? [] : popQ.data
  const trainers = trainersQ.isError ? [] : trainersQ.data

  const preset = n => { setFrom(shift(-(n - 1))); setTo(todayISO()) }
  const activePreset = to === todayISO() && from === shift(-6) ? 7 : to === todayISO() && from === shift(-29) ? 30 : to === todayISO() && from === shift(-89) ? 90 : 0

  const byDay = att?.byDay || []
  const points = byDay.map(b => ({ t: Date.parse(b.date + 'T12:00:00'), y: b.checkins, d: b.date }))
  const totalCheckins = byDay.reduce((s, b) => s + b.checkins, 0)
  const days = Math.max(1, byDay.length)

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Analytics" sub="Attendance, growth and training load" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)}
          className="bg-surface rounded-lg px-2.5 py-2 text-[13.5px] outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)]" />
        <span className="text-label-3 text-[13px]">→</span>
        <input type="date" value={to} min={from} max={todayISO()} onChange={e => e.target.value && setTo(e.target.value)}
          className="bg-surface rounded-lg px-2.5 py-2 text-[13.5px] outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)]" />
        <span className="flex gap-1.5 ml-auto">
          {[7, 30, 90].map(n => (
            <Chip key={n} on={activePreset === n} onClick={() => preset(n)}>{n}d</Chip>
          ))}
        </span>
      </div>

      {/* attendance */}
      <div className="bg-surface rounded-[14px] p-4 mb-3">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="text-[15px] font-semibold tracking-[-.014em] m-0">Check-ins per day</h2>
          {!att && !attErr && <span className="text-label-3 text-[12px]">loading…</span>}
        </div>
        {attErr && <ErrorBox>{attErr}</ErrorBox>}
        {!att && !attErr && <Skel h={150} />}
        {att && (
          <>
            <LineChart points={points} h={170} unit="check-ins" />
            <div className="grid grid-cols-3 gap-2 mt-3">
              <MiniStat label="Total check-ins" value={totalCheckins} />
              <MiniStat label="Avg / day" value={(totalCheckins / days).toFixed(1)} />
              <MiniStat label="No-show rate" value={(att.noShowRate * 100).toFixed(1) + '%'} tone={att.noShowRate > 0.08 ? 'red' : null} />
            </div>
            {(att.peakSlots?.length > 0) && (
              <div className="mt-4">
                <div className="text-[12.5px] text-label-2 mb-2">Average fill by slot start</div>
                <div className="grid grid-cols-2 desk:grid-cols-4 gap-x-4 gap-y-1.5">
                  {att.peakSlots.map(s => {
                    const pct = Math.min(100, Math.round(s.avgFill * 100))
                    return (
                      <div key={s.startMin} className="flex items-center gap-2">
                        <span className="text-[12px] text-label-2 tabular-nums w-[42px] shrink-0">{hhmm(s.startMin)}</span>
                        <span className="flex-1 h-[6px] rounded-full bg-surface-3 overflow-hidden">
                          <span className="block h-full rounded-full" style={{
                            width: pct + '%',
                            background: pct >= 80 ? 'var(--red)' : pct >= 55 ? 'var(--acc)' : 'var(--label-4)',
                          }} />
                        </span>
                        <span className="text-[11.5px] text-label-3 tabular-nums w-[34px] text-right">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* members growth */}
      <div className="bg-surface rounded-[14px] p-4 mb-3">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-[15px] font-semibold tracking-[-.014em] m-0">Members · new vs expired</h2>
          <span className="flex gap-3">
            <LegendDot color="var(--green)" label="Joined" />
            <LegendDot color="var(--red)" label="Expired" />
          </span>
        </div>
        {!growth ? (
          <Skel h={140} />
        ) : growth.length === 0 ? (
          <Empty icon="chart" title="No data yet" />
        ) : (
          <>
            <div className="flex items-end gap-2 h-[130px]">
              {growth.map(g => {
                const max = Math.max(...growth.map(x => Math.max(x.newMembers, x.expired)), 1)
                return (
                  <div key={g.ym} className="flex-1 h-full flex items-end justify-center gap-[3px] min-w-0" title={`${g.ym}: +${g.newMembers} joined, ${g.expired} expired`}>
                    <Bar v={g.newMembers} max={max} color="var(--green)" />
                    <Bar v={g.expired} max={max} color="color-mix(in srgb, var(--red) 60%, transparent)" />
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 mt-1.5">
              {growth.map(g => {
                const [, m] = g.ym.split('-')
                return <div key={g.ym} className="flex-1 text-center text-[10.5px] text-label-3 truncate">{MONTHS[+m - 1]}</div>
              })}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* popular exercises */}
        <div className="bg-surface rounded-[14px] p-4">
          <h2 className="text-[15px] font-semibold tracking-[-.014em] m-0 mb-3">Popular exercises · 30 days</h2>
          {!pop ? (
            <SkelList n={5} h={36} />
          ) : pop.length === 0 ? (
            <Empty icon="dumbbell" title="No workouts logged" hint="Exercise usage from member workout logs appears here." />
          ) : (
            pop.slice(0, 10).map((e, i) => {
              const max = pop[0].count || 1
              const name = e.name || EXDB.find(x => x.id === String(e.id))?.n || 'Exercise #' + e.id
              return (
                <div key={e.id} className="flex items-center gap-2.5 py-[5px]">
                  <span className="text-[11px] text-label-3 tabular-nums w-4 text-right shrink-0">{i + 1}</span>
                  <span className="text-[13.5px] truncate flex-1 min-w-0">{name}</span>
                  <span className="hidden sm:block w-[70px] h-[5px] rounded-full bg-surface-3 overflow-hidden shrink-0">
                    <span className="block h-full bg-acc rounded-full" style={{ width: Math.max(4, (e.count / max) * 100) + '%' }} />
                  </span>
                  <span className="text-[12px] text-label-2 tabular-nums w-8 text-right shrink-0">{e.count}</span>
                </div>
              )
            })
          )}
        </div>

        {/* trainers */}
        <div className="bg-surface rounded-[14px] p-4 overflow-x-auto">
          <h2 className="text-[15px] font-semibold tracking-[-.014em] m-0 mb-3">Trainers</h2>
          {!trainers ? (
            <SkelList n={3} h={44} />
          ) : trainers.length === 0 ? (
            <Empty icon="person" title="No trainers yet" hint="Promote a member account to TRAINER under Members." />
          ) : (
            <table className="w-full border-collapse text-[13px]" style={{ minWidth: 380 }}>
              <thead>
                <tr className="text-left text-label-3 text-[11px]">
                  <th className="py-1.5 pr-2">Trainer</th>
                  <th className="px-2 py-1.5 text-right">PT done</th>
                  <th className="px-2 py-1.5 text-right">Upcoming</th>
                  <th className="px-2 py-1.5 text-right">Members</th>
                  <th className="pl-2 py-1.5 text-right">Hrs/wk</th>
                </tr>
              </thead>
              <tbody>
                {trainers.map(t => (
                  <tr key={t.id} className="border-t border-sep-op">
                    <td className="py-2 pr-2 truncate max-w-[140px]">{t.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.ptCompleted}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.ptUpcoming}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.assignedMembers}</td>
                    <td className="pl-2 py-2 text-right tabular-nums text-label-2">{t.weeklyHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, tone }) {
  return (
    <div className="bg-surface-2/50 rounded-xl px-3 py-2 min-w-0">
      <div className="text-[11.5px] text-label-3 truncate">{label}</div>
      <div className="text-[17px] font-semibold tracking-[-.02em] truncate" style={tone ? { color: `var(--${tone})` } : null}>{value}</div>
    </div>
  )
}

function Bar({ v, max, color }) {
  return (
    <span className="w-[9px] max-w-[26px] flex-1 rounded-t-md" style={{
      height: Math.max(2, (v / max) * 100) + '%',
      background: v ? color : 'transparent',
    }} />
  )
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-label-2">
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />{label}
    </span>
  )
}

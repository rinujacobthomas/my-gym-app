import { api } from '@og/api-client'
import { useQuery } from '@tanstack/react-query'
import Icon from '@og/ui'
import { inr } from '../lib/format.js'
import { PageHead, Empty, Skel, ErrorBox, errText } from '../components/bits.jsx'

function Tile({ label, value, sub, tone }) {
  return (
    <div className="bg-surface rounded-[14px] px-3.5 py-3 min-w-0">
      <div className="text-label-2 text-[12.5px] tracking-[-.004em] truncate">{label}</div>
      <div className="text-[21px] desk:text-[23px] font-semibold tracking-[-.026em] mt-[3px] leading-[1.05] truncate"
        style={tone ? { color: `var(--${tone})` } : null}>{value}</div>
      {sub != null && <div className="text-[11.5px] text-label-3 mt-[2px] truncate">{sub}</div>}
    </div>
  )
}

const share = (v, total) => (total ? Math.round((v / total) * 100) + '% of today' : '—')

export default function Overview() {
  const q = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api('/api/admin/overview'),
    refetchInterval: 30_000,
  })
  const d = q.data
  const err = q.isError ? errText(q.error) : null

  const occ = d?.liveOccupancyNow || {}
  const occPct = occ.capacityNow ? Math.min(100, Math.round((occ.checkedInNow / occ.capacityNow) * 100)) : 0
  const fill = d?.fillByHour || []
  const maxFill = fill.length ? Math.max(100, ...fill.map(f => f.pct)) : 100

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Overview" sub={d ? `Today · ${d.activeMembers} active of ${d.totalMembers} members` : 'Live snapshot of the gym'} />

      {err && !d && <ErrorBox>{err}</ErrorBox>}

      {!d && !err && (
        <div className="grid grid-cols-2 desk:grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, i) => <Skel key={i} h={84} />)}
          <Skel h={110} className="col-span-2 desk:col-span-4" />
          <Skel h={170} className="col-span-2 desk:col-span-4" />
        </div>
      )}

      {d && (
        <>
          {d.pendingApprovals > 0 && (
            <a href="#/approvals"
              className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-2 text-[14px] font-medium no-tap transition-transform active:scale-[.985]"
              style={{ color: 'var(--orange)', background: 'color-mix(in srgb, var(--orange) 12%, transparent)' }}>
              <Icon name="clock" className="text-[17px]" />
              <span className="flex-1 min-w-0 truncate">
                {d.pendingApprovals} member{d.pendingApprovals === 1 ? '' : 's'} waiting for approval
              </span>
              <Icon name="chevronRight" className="text-[14px]" />
            </a>
          )}

          <div className="grid grid-cols-2 desk:grid-cols-4 gap-2 mb-2">
            <Tile label="Revenue today" value={inr(d.revenueTodayPaise)} tone="acc" sub="incl. day passes" />
            <Tile label="Online" value={inr(d.onlineTodayPaise)} sub={share(d.onlineTodayPaise, d.revenueTodayPaise)} />
            <Tile label="Cash" value={inr(d.cashTodayPaise)} sub={share(d.cashTodayPaise, d.revenueTodayPaise)} />
            <Tile label="Card POS" value={inr(d.cardTodayPaise)} sub={share(d.cardTodayPaise, d.revenueTodayPaise)} />

            <Tile label="Day-pass sales" value={inr(d.daypassTodayPaise)} />
            <Tile label="Check-ins" value={d.checkinsToday} />
            <Tile label="Booked today" value={d.bookedToday} />
            <Tile label="No-shows yesterday" value={d.noShowsYesterday} tone={d.noShowsYesterday > 0 ? 'red' : null} />

            <Tile label="Active members" value={d.activeMembers} tone="green" />
            <Tile label="Expiring ≤ 7 days" value={d.expiring7} tone={d.expiring7 > 0 ? 'yellow' : null} />
            <Tile label="Pending approvals" value={d.pendingApprovals} tone={d.pendingApprovals > 0 ? 'orange' : null} />
            <Tile label="Total members" value={d.totalMembers} />
          </div>

          <div className="bg-surface rounded-[14px] p-4 mb-2">
            <div className="flex items-baseline justify-between gap-3 mb-2.5">
              <span className="text-label-2 text-[13px]">Live occupancy now</span>
              <span className="text-[15px] font-semibold tabular-nums">{occ.checkedInNow}<span className="text-label-3 font-normal"> / {occ.capacityNow} cap</span></span>
            </div>
            {occ.capacityNow ? (
              <>
                <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-acc transition-[width] duration-500 ease-[var(--ease)]" style={{ width: occPct + '%' }} />
                </div>
                <div className="text-[11.5px] text-label-3 mt-1.5">{occPct}% of live slot capacity in the gym right now</div>
              </>
            ) : (
              <div className="text-label-3 text-[13px] py-1">No slots running at the moment.</div>
            )}
          </div>

          <div className="bg-surface rounded-[14px] p-4">
            <div className="text-label-2 text-[13px] mb-3">Booked fill by hour</div>
            {fill.length === 0 ? (
              <Empty icon="chart" title="No slots scheduled today" hint="Add weekly templates under Slots to see hourly fill here." />
            ) : (
              <>
                <div className="flex items-end gap-1.5 h-[120px]">
                  {fill.map(f => (
                    <div key={f.label} className="flex-1 h-full flex flex-col justify-end items-stretch min-w-0" title={`${f.label}:00 — ${f.pct}%`}>
                      <div className="rounded-t-md transition-[height] duration-500 ease-[var(--ease)]"
                        style={{
                          height: Math.max(3, (f.pct / maxFill) * 100) + '%',
                          background: f.pct >= 85
                            ? 'color-mix(in srgb, var(--red) 75%, transparent)'
                            : f.pct >= 60
                              ? 'color-mix(in srgb, var(--acc) 80%, transparent)'
                              : 'color-mix(in srgb, var(--acc) 38%, transparent)',
                        }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  {fill.map(f => (
                    <div key={f.label} className="flex-1 text-center text-[10.5px] text-label-3 tabular-nums min-w-0 truncate">{f.label}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

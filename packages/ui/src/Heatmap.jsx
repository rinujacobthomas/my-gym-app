import { useEffect, useRef } from 'react'
import { fmtVol, isoOf, todayISO, MONTHS } from '@og/core'
import { t } from '@og/core'

// GitHub-style activity heatmap, shaded by time trained per day.
// Cell shading: the same accent ramp the muscle map uses, so one scale means one
// thing app-wide. Levels are full class strings so the Tailwind scanner sees them.
const CELL = [
  'bg-surface-2',
  'bg-[color-mix(in_srgb,var(--acc)_30%,var(--surface-2))]',
  'bg-[color-mix(in_srgb,var(--acc)_55%,var(--surface-2))]',
  'bg-[color-mix(in_srgb,var(--acc)_78%,var(--surface-2))]',
  'bg-acc',
]

export default function Heatmap({ S, onDay }) {
  const wrapRef = useRef(null)
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  const agg = {}
  S.workouts.forEach(w => {
    const a = agg[w.d] = agg[w.d] || { n: 0, vol: 0, min: 0 }
    a.n++; a.vol += w.vol || 0
    a.min += Math.max(0, Math.round(((w.end || w.start) - w.start) / 60000))
  })
  const mins = Object.values(agg).map(a => a.min).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (mins.length ? mins[Math.min(mins.length - 1, Math.floor(p * mins.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const level = a => !a ? 0 : !a.min ? 1 : a.min >= t3 ? 4 : a.min >= t2 ? 3 : a.min >= t1 ? 2 : 1

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const end = new Date(today); end.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const start = new Date(end); start.setDate(end.getDate() - 52 * 7)

  const months = [], cols = []
  let lastMonth = -1
  for (let wk = 0; wk <= 52; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    const showM = mo !== lastMonth && colStart.getDate() <= 7 && wk < 51
    months.push(<span key={wk}>{showM ? t(MONTHS[mo]) : ''}</span>)
    if (colStart.getDate() <= 7) lastMonth = mo
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const a = agg[key]
      const cls = 'w-[11px] h-[11px] rounded-[3px] shrink-0 no-tap ' + CELL[level(a)] +
        (key === todayISO() ? ' shadow-[0_0_0_1.5px_var(--acc)]' : '') +
        (day > today ? ' opacity-30' : '') +
        (a ? ' cursor-pointer' : '')
      cells.push(<div key={d} className={cls}
        title={key + (a ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${a.min} min · ${fmtVol(a.vol, S.unit)}` : '')}
        onClick={a ? () => onDay(key) : undefined} />)
    }
    cols.push(<div key={wk} className="flex flex-col gap-[3px]">{cells}</div>)
  }

  return <>
    <div className="overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden desk:flex desk:flex-col desk:items-center" ref={wrapRef}>
      <div className="flex ml-[30px] mb-[5px]">
        {months.map((m, i) => <span key={i} className="flex-none w-[14px] text-[11px] text-label-3 whitespace-nowrap overflow-visible">{m}</span>)}
      </div>
      <div className="flex">
        <div className="flex flex-col gap-[3px] shrink-0 w-[28px]">
          <span className="h-[11px] text-[10px] text-label-2 leading-[11px]">{t('Mon')}</span><span className="h-[11px]" />
          <span className="h-[11px] text-[10px] text-label-2 leading-[11px]">{t('Wed')}</span><span className="h-[11px]" />
          <span className="h-[11px] text-[10px] text-label-2 leading-[11px]">{t('Fri')}</span><span className="h-[11px]" /><span className="h-[11px]" />
        </div>
        <div className="flex gap-[3px]">{cols}</div>
      </div>
    </div>
    <div className="flex items-center gap-1 justify-end mt-[9px] text-[11px] text-label-3">
      {t('Less time')}
      {CELL.map((c, i) => <div key={i} className={'w-[10px] h-[10px] rounded-[3px] shrink-0 ' + c} />)}
      {t('More time')}
    </div>
  </>
}

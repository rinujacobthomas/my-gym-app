import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '../lib/exercises.js'
import { lastBW, streakWeeks, setLabel, modeOf, effortOf } from '../lib/history.js'
import { fmtNum, fmtDate, fmtVol, todayISO, weekKey } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, workoutDetailSheet, WorkoutRow, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { loadOfWorkouts, rankOf, MUSCLE_NAME } from '../lib/muscles.js'
import { e1rmSeries, best1RM } from '../lib/onerm.js'
import {
  hasEffort, displayScale, scaleName, toScale, avgRir, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR
} from '../lib/effort.js'
import { Button, Segmented, SelectRow } from '../components/ui.jsx'

// Which muscles the training in a window actually hit — and, the point of the card,
// which ones it keeps missing. Shading is relative within the window (lib/muscles.js).
function MuscleBalance({ S }) {
  const [win, setWin] = useState(7)
  const [hard, setHard] = useState(false)
  const [sel, setSel] = useState(null)
  const now = Date.now()
  const inWin = S.workouts.filter(w =>
    win === 0 ? true
      : win === 7 ? weekKey(w.d) === weekKey(todayISO())
        : (w.start || new Date(w.d).getTime()) > now - win * 86400000)
  // Counting only the sets taken near failure turns the map from "where did the volume go"
  // into "where did the stimulus go" — a muscle can lead on sets and still never be trained
  // hard. Offered only when the window holds ratings at all, since with none the hard map
  // would just be empty and read as "you trained nothing".
  const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
  const on = hard && rated
  const load = loadOfWorkouts(inWin, on ? isHardSet : null)
  const { worked, missed } = rankOf(load)
  const top = worked.slice(0, 4)
  const max = worked.length ? load[worked[0]] : 0
  const sets = m => Math.round((load[m] || 0) * 10) / 10

  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">{t('Muscle balance')} <span className="text-label-3 normal-case! tracking-normal!">· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
      {rated && <Button size="sm" icon="flame" className={on ? 'text-yellow!' : undefined}
        onClick={() => { setHard(h => !h); setSel(null) }}>{on ? t('Hard') : t('All')}</Button>}
    </div>
    <Segmented className="seg-range mb-2.5" value={win} onChange={v => { setWin(v); setSel(null) }}
      options={[{ value: 7, label: t('Week') }, { value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 0, label: t('All') }]} />
    {inWin.length ? <>
      <BodyMap className="tappable" load={load} body={S.body} selected={sel}
        onMuscle={m => setSel(s => (s === m ? null : m))} />
      <BodyMapLegend />
      {sel && <div className="flex items-center gap-[9px] py-[5px] border-t-[0.5px] border-sep mt-1 pt-2.5">
        <span className="flex-1 min-w-0 text-[14px] truncate"><b>{t(MUSCLE_NAME[sel])}</b></span>
        <span className="text-[12px] text-label-2 min-w-[52px] text-right shrink-0">{sets(sel) ? t('{0} sets', sets(sel)) : on ? t('no hard sets') : t('not trained')}</span>
      </div>}
      {!sel && top.map(m => <div key={m} className="flex items-center gap-[9px] py-[5px]">
        <span className="flex-1 min-w-0 text-[14px] truncate">{t(MUSCLE_NAME[m])}</span>
        <span className="w-[74px] h-[5px] rounded-[3px] bg-surface-2 shrink-0 overflow-hidden"><i className="block h-full bg-acc rounded-[3px]" style={{ width: Math.round(load[m] / max * 100) + '%', background: on ? 'var(--yellow)' : undefined }} /></span>
        <span className="text-[12px] text-label-2 min-w-[52px] text-right shrink-0">{t('{0} sets', sets(m))}</span>
      </div>)}
      {missed.length > 0 && <>
        <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-3 mb-2 px-1">{on ? t('No hard sets in this period') : t('Not trained in this period')}</h4>
        <div className="flex flex-wrap gap-1.5 mt-1">{missed.map(m => <span key={m} className="text-[12px] px-[9px] py-1 rounded-full bg-[color-mix(in_srgb,var(--orange)_16%,transparent)] text-orange">{t(MUSCLE_NAME[m])}</span>)}</div>
      </>}
      {!missed.length && worked.length > 0 &&
        <div className="text-label-2 text-[13px] leading-[1.38] mt-2.5">{on
          ? t('Every muscle group got at least one hard set in this period.')
          : t('Every muscle group got some work in this period.')}</div>}
    </> : <div className="text-label-2 text-[13px] leading-[1.38]">{t('No workouts in this period yet.')}</div>}
  </div>
}

// How hard the training was — the half of the picture a volume chart cannot show. Everything
// is computed in RIR (lib/effort.js) and converted to whichever scale this profile reads.
// Every number carries how much of the training it speaks for: rating is optional and off by
// default, so a partly rated history is the normal case, and an average without its
// denominator would quietly speak for sets that were never rated.
function EffortCard({ S }) {
  const [win, setWin] = useState(90)
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const sum = effortSummary(S, win)
  const weeks = effortWeeks(S, win)
  const hist = effortHistogram(S, win)
  const maxBin = Math.max(1, ...hist.map(b => b.n))
  // The week's set count rides along in the tooltip, because the pair is the reading:
  // volume up with effort up is fatigue piling up, volume up with effort flat is adaptation.
  const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
  // Bins run hardest-first in both scales: RIR 0 and RPE 10 are the same set.
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))

  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 mb-3">{t('Effort')} <span className="text-label-3 normal-case! tracking-normal!">· {t('how close to failure')}</span></h2>
    <Segmented className="seg-range mb-2.5" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum.rated === 0 ? <div className="text-label-2 text-[13px] leading-[1.38]">{t('No rated sets in this period.')}</div> : <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[26px] font-semibold tracking-[-.026em] leading-[1.1]">{sum.avg == null ? '—' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd}</div>
          <div className="text-label-3 text-[13px] leading-[1.38]">{t('average effort')}</div>
        </div>
        <div className="text-right">
          <div className="text-[26px] font-semibold tracking-[-.026em] leading-[1.1] text-yellow">{sum.hardPct == null ? '—' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="text-label-3 text-[13px] leading-[1.38]">{t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR)))}</div>
        </div>
      </div>
      <div className="text-label-3 text-[13px] leading-[1.38] mt-2">{t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {effortOf(S) === 'none' && <div className="text-[13px] leading-[1.38] text-yellow mt-1">
        {t('Effort per set is switched off — turn it on in Settings to keep rating.')}
      </div>}
      {pts.length > 1 && <>
        <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-3 mb-2 px-1">{t('Week by week')}</h4>
        <div className="w-full overflow-hidden"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-3 mb-2 px-1">{t('Where the sets land')}</h4>
      {hist.map(b => <div key={b.rir} className="flex items-center gap-[9px] py-[5px]">
        <span className="flex-1 min-w-0 text-[14px] truncate">{hd} {binLabel(b)}</span>
        <span className="w-[74px] h-[5px] rounded-[3px] bg-surface-2 shrink-0 overflow-hidden"><i className="block h-full bg-acc rounded-[3px]" style={{ width: Math.round(b.n / maxBin * 100) + '%', background: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="text-[12px] text-label-2 min-w-[52px] text-right shrink-0">{b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '—'}</span>
      </div>)}
      <div className="text-label-3 text-[13px] leading-[1.38] mt-2">
        {t('Most working sets belong close to failure without living there — half at the floor and half at the top average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

// Stats = the analytics hub: all charts, progress and history live here.
// Desk: tiles go four across; the analysis cards pair up in columns.
export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [range, setRange] = useState(90)
  const [exId, setExId] = useState(null)
  const [exMetric, setExMetric] = useState('top')
  const now = Date.now()
  const anyEffort = hasEffort(S)
  const kind = displayScale(S)
  const hd = scaleName(kind)

  const bwPts = S.bodyweight.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
  const monthW = S.workouts.filter(w => w.d.slice(0, 7) === todayISO().slice(0, 7)).length

  const exHist = [...new Set(S.workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => EXIDX[id]).sort((a, b) => EXIDX[a].n < EXIDX[b].n ? -1 : 1)
  const curEx = exId && exHist.includes(exId) ? exId : exHist[0] || null
  // How this exercise was logged most recently decides what the curve means: top weight,
  // longest hold or top speed. Sets logged in another mode lack the field and score 0, so a
  // switched exercise drops its old points instead of mixing seconds into a weight chart.
  const curMode = curEx ? (() => {
    for (let i = S.workouts.length - 1; i >= 0; i--) {
      const en = S.workouts[i].entries.find(e => e.id === curEx)
      if (en) return modeOf({ ...(en.target || {}), id: curEx })
    }
    return modeOf({ id: curEx })
  })() : 'reps'
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  const metric = s => curCardio ? (s.speed || 0) : curTimed ? (s.sec || 0) : (s.w || 0)
  const exUnit = curCardio ? 'km/h' : curTimed ? 's' : S.unit
  let exPts = [], exList = [], exBest = 0
  if (curEx) {
    S.workouts.forEach(w => {
      const en = w.entries.find(e => e.id === curEx)
      if (en) { const mx = Math.max(0, ...en.sets.filter(s => s.done).map(metric), curCardio || curTimed ? 0 : (en.topW || 0)); if (mx > 0) { exPts.push({ t: w.start, y: mx, d: w.d, sets: en.sets.filter(s => s.done), target: en.target }); if (mx > exBest) exBest = mx } }
    })
    exList = exPts.slice(-5).reverse()
  }
  // Estimated 1RM (issue #18) — only reps-mode training produces one, so cardio and timed
  // work simply have no points and the toggle stays hidden.
  const e1Pts = curEx ? e1rmSeries(S, curEx) : []
  const e1Best = curEx ? best1RM(S, curEx) : null
  const showE1 = e1Pts.length > 0
  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(Boolean)
  const onE1 = showE1 && exMetric === 'e1rm'
  const onEff = showEff && exMetric === 'effort'
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i]))
  }))
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })

  return <>
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <div><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Stats')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Progress & history')}</div></div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button>
    </div>

    <div className="grid grid-cols-2 gap-2.5 mb-3 desk:grid-cols-4">
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em] flex items-center gap-[5px]"><Icon name="dumbbell" className="text-[14px] text-label" />{t('Workouts')}</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{S.workouts.length}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em] flex items-center gap-[5px]"><Icon name="calendar" className="text-[14px] text-label" />{t('This month')}</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{monthW}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em] flex items-center gap-[5px]"><Icon name="flame" className="text-[14px] text-label" />{t('Week streak')}</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{streakWeeks(S)}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em] flex items-center gap-[5px]"><Icon name="scale" className="text-[14px] text-label" />{t('Weight 30d')}</div><div className="text-[22px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]" style={{ color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0) }}>{bwDelta30 === null ? '—' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}</div></div>
    </div>

    <div className="bg-surface rounded-[14px] p-4 mb-3">
      <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 mb-3">{t('Activity — last 12 months')} <span className="text-label-3 normal-case! tracking-normal!">· {t('by time trained')}</span></h2>
      <Heatmap S={S} onDay={iso => { const ws = S.workouts.filter(w => w.d === iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso) }} />
    </div>

    {(S.workouts.length > 0 || anyEffort) && <div className="desk:grid desk:grid-cols-[repeat(auto-fit,minmax(440px,1fr))] desk:gap-3.5 desk:items-start">
      {S.workouts.length > 0 && <MuscleBalance S={S} />}
      {anyEffort && <EffortCard S={S} />}
    </div>}

    <div className="desk:grid desk:grid-cols-2 desk:gap-3.5 desk:items-start [&>*]:desk:min-w-0">
      <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">{t('Body weight')}</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" icon="target" className={S.targetW ? 'text-yellow!' : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
            <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
          </div>
        </div>
        <Segmented className="seg-range mb-2.5" value={range} onChange={setRange}
          options={[{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
        <div className="w-full overflow-hidden"><LineChart points={bwPts} h={160} unit={S.unit} goal={S.targetW} /></div>
      </div>

      <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
        <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 mb-3">{t('Exercise progress')}</h2>
        {exHist.length ? <>
          <div className="bg-surface rounded-[14px] overflow-hidden mb-2.5">
            <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId}
              options={exHist.map(id => ({ value: id, label: EXIDX[id].n }))} />
          </div>
          {exOpts.length > 1 && <Segmented className="seg-range mb-2.5" value={onEff ? 'effort' : onE1 ? 'e1rm' : 'top'} onChange={setExMetric} options={exOpts} />}
          <div className="w-full overflow-hidden">
            {onEff
              ? <LineChart points={effPts} h={150} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
              : <LineChart points={onE1 ? e1Pts.map(p => ({ t: p.t, y: p.y, d: p.d })) : topPts} h={150} unit={exUnit} color="var(--blue)" />}
          </div>
          <div className="mt-2">{exList.map((p, i) => <div key={i} className="flex items-center justify-between text-[13px] leading-[1.38] py-1.5 border-b-[0.5px] border-sep">
            <span className="text-label-2">{fmtDate(p.d, true)}</span><span>{p.sets.map(s => setLabel(curEx, s, p.target)).join('  ')}</span></div>)}</div>
          <div className="text-label-3 text-[13px] leading-[1.38] mt-2">
            {onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Top speed per workout') : curTimed ? t('Longest hold per workout') : t('Best set weight per workout')}
            {onEff ? '' : <> · {t('Best:')}{' '}<b className="text-acc">{fmtNum(onE1 ? e1Best.est : exBest)} {onE1 ? S.unit : exUnit}</b></>}
          </div>
          {onE1 && <div className="text-label-3 text-[13px] leading-[1.38] mt-1">
            {t('Best estimate from {0} on {1} — an estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}
          </div>}
          {!onEff && !onE1 && showEff && <div className="text-label-3 text-[13px] leading-[1.38] mt-1">
            {t('A fuller dot means less left in the tank — the same weight at a lower {0} is progress the line alone does not show.', hd)}
          </div>}
        </> : <div className="text-label-2 text-[13px] leading-[1.38]">{t('Finish your first workout to see progress curves here.')}</div>}
      </div>
    </div>

    {S.workouts.length > 0 && <>
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">{t('Recent workouts')}</h4>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {S.workouts.length}</Button>
      </div>
      <div className="flex flex-col gap-2 desk:grid desk:grid-cols-2 desk:gap-2">{[...S.workouts].reverse().slice(0, 6).map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
    </>}
  </>
}

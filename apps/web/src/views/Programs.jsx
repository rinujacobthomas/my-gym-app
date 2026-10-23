import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useStore } from '../store/useStore.js'
import { EXIDX } from '@og/core'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { startFlow } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

function exerciseLine(ex, unit) {
  const sets = ex.sets ?? (ex.target && ex.target.sets)
  const reps = ex.reps ?? (ex.target && ex.target.reps)
  const kg = ex.weight ?? ex.weightKg ?? (ex.target && ex.target.weight)
  const w = kg && unit === 'lb' ? Math.round(kg * 2.2046) : kg
  const sec = ex.sec ?? ex.seconds ?? (ex.target && (ex.target.sec || ex.target.time))
  const exId = ex.exerciseId || ex.id
  const name = (EXIDX[exId] && EXIDX[exId].n) || ex.name || ex.title || t('Exercise')
  let dose = ''
  if (sets && reps) dose = sets + '×' + reps + (w ? ' @ ' + fmtNum(w) + ' ' + unit : '')
  else if (sets && sec) dose = sets + '×' + sec + 's'
  else if (reps) dose = reps + '×'
  else if (sec) dose = sec + 's'
  return { name, dose }
}

// A program day as a one-off routine the workout screen can run (weights in the member's unit).
function dayRoutine(prog, day, unit) {
  const toUnit = kg => (kg ? (unit === 'lb' ? Math.round(kg * 2.2046) : kg) : 0)
  return {
    id: 'program-' + day.id,
    name: (prog.title || t('Program')) + ' · ' + (day.label || t('Day {0}', day.seq)),
    ex: (day.exercises || []).filter(x => EXIDX[x.exerciseId]).map(x => {
      const mode = x.mode === 'time' || x.mode === 'cardio' ? x.mode : 'reps'
      const cfg = { id: x.exerciseId, sets: x.sets || 1, mode, weight: toUnit(x.weightKg) }
      if (mode === 'reps') cfg.reps = x.reps || 10
      if (mode === 'time') cfg.sec = x.sec || 30
      if (mode === 'cardio') { cfg.min = x.min || 20; cfg.speed = x.speed || 8 }
      if (x.bodyweight) cfg.bodyweight = true
      if (x.perSide) cfg.perSide = true
      return cfg
    }),
  }
}

function ProgramCard({ en, unit }) {
  const prog = en.program || {}
  const weeks = prog.weeks || []
  const totalDays = weeks.reduce((a, w) => a + ((w.days && w.days.length) || 0), 0)
  const done = en.completedDays || 0
  const unlocked = Math.max(done, en.unlockedDays || 0)
  const [openWeek, setOpenWeek] = useState(null)
  const days = weeks.flatMap(w => w.days || [])
  const nextDay = days.find(d => d.seq === done + 1) || null
  const nextOpen = nextDay && nextDay.seq <= unlocked
  const active = useStore(s => s.S.active)

  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-[20px] font-semibold tracking-[-.021em] leading-[1.15] min-w-0">{prog.title || t('Program')}</h2>
      {prog.level && <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 bg-acc-soft text-acc uppercase tracking-[.04em]">{prog.level}</span>}
    </div>

    <div className="flex items-center gap-2 mt-1.5 mb-2.5">
      <span className="text-label-2 text-[13px] shrink-0">{t('{0} of {1} days', done, totalDays)}</span>
      <span className="h-[6px] rounded-full bg-surface-2 overflow-hidden flex-1 flex">
        <span className="h-full bg-green" style={{ width: (totalDays ? (done / totalDays) * 100 : 0) + '%' }} />
        <span className="h-full bg-acc opacity-40" style={{ width: (totalDays ? (Math.min(unlocked, totalDays) - done) / totalDays * 100 : 0) + '%' }} />
      </span>
      {unlocked - done > 1 && <span className="text-label-3 text-[13px] shrink-0">{t('{0} unlocked', unlocked - done)}</span>}
    </div>

    {totalDays > 0 && done >= totalDays
      ? <div className="text-green text-[14px] font-medium mb-2.5">{t('Program complete — great work! Ask your coach what is next.')}</div>
      : nextDay && (nextOpen
        ? <Button variant="primary" icon="play" className="mb-2.5" disabled={!!active}
            onClick={() => startFlow(null, { routine: dayRoutine(prog, nextDay, unit), enrollmentId: en.enrollmentId, seq: nextDay.seq })}>
            {t('Start {0}', nextDay.label || t('Day {0}', nextDay.seq))}
          </Button>
        : <div className="text-label-2 text-[13px] leading-[1.38] mb-2.5">{t('Next up: {0} — your coach will unlock it when you are ready.', nextDay.label || t('Day {0}', nextDay.seq))}</div>)}

    {weeks.map((week, wi) => {
      const open = openWeek === wi
      return <div key={wi} className="rounded-xl overflow-hidden bg-surface-2/50 mb-1.5 last:mb-0" style={{ background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)' }}>
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left no-tap active:opacity-60 transition-opacity duration-150"
          onClick={() => setOpenWeek(open ? null : wi)}>
          <span className="text-[15px] font-medium tracking-[-.009em] flex-1">{t('Week {0}', wi + 1)}</span>
          <span className="text-label-3 text-[13px]">{week.days ? week.days.length : 0} {t('days')}</span>
          <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-label-3 text-[14px]" />
        </button>
        {open && (week.days || []).map(day => {
          const locked = day.seq > unlocked
          return <div key={day.id} className={'lrow relative px-3 py-2 ' + (locked ? 'opacity-70' : '')}>
            <div className="flex items-center gap-2">
              {locked
                ? <Icon name="lock" className="text-label-3 text-[13px] shrink-0" />
                : <span className="w-[18px] h-[18px] rounded-full shrink-0 bg-acc-soft text-acc flex items-center justify-center"><Icon name="check" className="text-[11px] [--icon-stroke:3]" /></span>}
              <span className="text-[15px] font-medium tracking-[-.009em] truncate flex-1">{day.label || t('Day {0}', day.seq)}</span>
              {(day.exercises || []).length > 0 && <span className="text-label-3 text-[13px] shrink-0">{t('{0} exercises', day.exercises.length)}</span>}
            </div>
            {locked
              ? <div className="text-label-3 text-[13px] leading-[1.38] mt-0.5 pl-[26px]">{t('Locked — ask your trainer to unlock it.')}</div>
              : <ul className="mt-1 pl-[26px] flex flex-col gap-0.5">
                {(day.exercises || []).map((ex, i) => {
                  const l = exerciseLine(ex, unit)
                  return <li key={ex.id || i} className="flex items-baseline justify-between gap-3 text-[14px] leading-[1.4]">
                    <span className="truncate">{l.name}</span>
                    {l.dose && <span className="text-label-2 shrink-0 tabular-nums">{l.dose}</span>}
                  </li>
                })}
                {!(day.exercises || []).length && <li className="text-label-3 text-[13px]">{t('No exercises listed yet.')}</li>}
              </ul>}
          </div>
        })}
      </div>
    })}
    {!weeks.length && <div className="text-label-2 text-[13px] leading-[1.38]">{t('The plan outline hasn\'t been published yet — check back soon.')}</div>}
  </div>
}

export default function Programs() {
  const nav = useNavigate()
  const unit = useStore(s => s.S.unit)
  // always refetch on open: finishing a program day (in the workout flow) moves progress on
  const Q = useQuery({ queryKey: qk.assignedPrograms, queryFn: () => api('/api/programs/assigned'), refetchOnMount: 'always' })
  const list = Q.data || []

  return <div>
    <div className="flex items-end gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Programs')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Assigned by your trainer')}</div>
      </div>
    </div>

    {Q.isPending && <>
      <div className="h-16 bg-surface rounded-xl animate-pulse mb-2" />
      <div className="h-16 bg-surface rounded-xl animate-pulse mb-2" />
    </>}

    {Q.error && !Q.isPending && <div className="bg-surface rounded-[14px] p-5 text-center">
      <div className="text-label-2 text-[13px] mb-2.5">{t('Could not load your programs.')}</div>
      <button className="inline-flex items-center gap-[5px] px-[14px] py-2 rounded-lg bg-acc-soft text-acc text-[15px] no-tap active:scale-[.975] transition-transform duration-150" onClick={() => Q.refetch()}>
        <Icon name="reset" className="text-[16px]" />{t('Retry')}
      </button>
    </div>}

    {!Q.isPending && !Q.error && !list.length && <div className="bg-surface rounded-[14px] p-8 text-center">
      <Icon name="clipboard" className="text-[30px] text-label-3 mx-auto" />
      <div className="text-[17px] font-semibold tracking-[-.012em] mt-2">{t('No programs yet')}</div>
      <div className="text-label-2 text-[13px] leading-[1.38] mt-1 max-w-[300px] mx-auto">{t('When your trainer assigns you a program it will appear here with each day unlocked as you progress 💪')}</div>
    </div>}

    <div className="desk:grid desk:grid-cols-2 desk:gap-3 desk:items-start">
      {list.map(en => <ProgramCard key={en.enrollmentId} en={en} unit={unit} />)}
    </div>

    <div className="h-2" />
  </div>
}

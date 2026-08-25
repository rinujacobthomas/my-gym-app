import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exOr } from '../lib/exercises.js'
import { effectiveRoutine, lastEntryFor, bestWeightFor, buildSets, setsDoneActive, supersetUnits, unitOf, setLabel, modeOf, isBw, isPerSide, sideReps, repStep, EFFORT, effortOf, stepEffort, capEffort } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, exCount, DAYN } from '../lib/format.js'
import { beep, vibrate } from '../lib/sound.js'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import Media from '../components/Media.jsx'
import { startFlow, exercisePicker, exConfigSheet, exerciseDetailSheet, topWeightSheet, finishWorkout, workoutCompleteSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Check, NumberField } from '../components/ui.jsx'
import { nextPrescription, applyPrescription } from '../lib/progression.js'
import { glyphOf } from '../lib/glyphs.js'

/* ---------- start chooser (no active workout) ---------- */
function StartChooser() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const todayR = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const others = S.routines.filter(r => r !== todayR)
  return <div className="max-w-[640px] mx-auto desk:max-w-[860px]">
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <div><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Start workout')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t(DAYN[new Date().getDay()])} — {todayR ? t('today is {0}', todayR.name) : t('rest day, but no one’s stopping you')}</div></div>
    </div>
    {todayR && <div className="bg-surface rounded-[14px] p-4 mb-3 border border-acc">
      <h2 className="text-[13px] font-normal tracking-[-.004em] text-acc m-0 mb-3">{t("Today's plan")}{todayOvr ? ' · ' + t('rescheduled') : ''}</h2>
      <div className="flex items-center justify-between mb-3">
        <div><div className="text-[30px] font-semibold tracking-[-.026em] leading-[1.1]">{todayR.name}</div><div className="text-label-2 text-[13px] leading-[1.38]">{exCount(todayR.ex.length)}</div></div>
        <span className="w-[38px] h-[38px] rounded-[9px] shrink-0 text-[22px] flex items-center justify-center text-white bg-acc"><Icon name={glyphOf(todayR.emoji)} /></span>
      </div>
      <Button variant="primary" icon="play" onClick={() => startFlow(todayR.id)}>{t('Start {0}', todayR.name)}</Button>
    </div>}
    {others.length > 0 && <><h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1">{t('Other routines')}</h4>
      <div className="flex flex-col gap-2 desk:grid desk:grid-cols-2 desk:gap-2">{others.map(r => <div key={r.id} className="flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer" onClick={() => startFlow(r.id)}>
        <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white bg-acc"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em]">{r.name}</div><div className="text-label-2 text-[13px] mt-0.5">{exCount(r.ex.length)}</div></div>
        <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize shrink-0">{t('Start')}</span></div>)}</div></>}
    <div className="h-3.5" />
    <Button icon="shuffle" onClick={() => startFlow(null)}>{t('Freestyle workout (pick as you go)')}</Button>
    {!S.routines.length && <><div className="h-2.5" /><Button variant="primary" onClick={() => nav('/plan')}>{t('Build a plan first')}</Button></>}
  </div>
}

/* ---------- elapsed clock (isolated so the workout tree doesn't re-render every second) ---------- */
function Elapsed({ start }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => { const s = Math.floor((Date.now() - start) / 1000); setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')) }
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv)
  }, [start])
  return <span>{t}</span>
}

/* ---------- one exercise block (reps: weight×reps · time: a held duration · cardio: duration+speed) ---------- */
function ExerciseBlock({ entryIdx, compact, onToggle, onField, onAddSet, onRemoveSet, onStartTimed }) {
  const S = useStore(s => s.S)
  const working = useUI(s => s.work)
  const entry = S.active.entries[entryIdx]
  const ex = exOr(entry.id)
  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardio = mode === 'cardio'
  const timed = mode === 'time'
  const last = lastEntryFor(S, entry.id)
  // The same number the "confirm your working weight" sheet calls your best, so the two
  // never disagree inside one session: heaviest logged set, or the working weight you kept.
  const best = cardio ? 0 : Math.max(bestWeightFor(S, entry.id), (S.exWeights[entry.id] || {}).w || 0)
  // What the progression policy decided for this session, and why (issue #17). Computed when
  // the session was built so the reason matches the numbers already in the rows.
  const plan = entry.plan
  // A bodyweight set has no weight to type, so the column is not there (issue #32) — one
  // stepper instead of two, which is the whole point of the flag. Adding a belt weight in the
  // config brings it back, now labelled as the addition it is.
  const cfg = { ...(entry.target || {}), id: entry.id }
  const bw = !cardio && isBw(cfg)
  const added = bw && entry.sets.some(s => s.w > 0)
  const loadCol = { f: 'w', step: 2.5, dec: true, hd: bw ? t('Added ({0})', S.unit) : t('Weight ({0})', S.unit) }
  // The reps column is the total in every mode, unilateral included — the stepper walks in
  // twos there so the number you land on is one you can actually split evenly.
  const repCol = { f: 'r', step: repStep(cfg), dec: false, hd: t('Reps') }
  const col1 = cardio ? { f: 'min', step: 1, dec: false, hd: t('Duration (min)') }
    : timed ? { f: 'sec', step: 5, dec: false, hd: t('Seconds') }
      : (bw && !added) ? repCol : loadCol
  const col2 = cardio ? { f: 'speed', step: 0.5, dec: true, hd: t('Speed (km/h)') }
    : timed ? ((bw && !added) ? null : loadCol)
      : (bw && !added) ? null : repCol
  // Effort (RIR or RPE, whichever the profile logs) only makes sense for weighted rep sets,
  // not cardio/timed holds, and is opt-in since it adds a third stepper to every row. `opt`
  // because an unlogged effort is not the same as 0 — RIR 0 says the set went to failure.
  const kind = effortOf(S)
  const eff = EFFORT[kind]
  const col3 = mode === 'reps' && eff ? { ...eff, eff: kind, dec: true, opt: true, hd: t(eff.hd) } : null
  // The effort column walks its own scale — see stepEffort. Weight and reps step up from 0
  // with no ceiling, as they always did.
  const bump = (s, i, col, dir) => {
    if (col.eff) return onField(i, col.f, stepEffort(col.eff, s[col.f], dir))
    onField(i, col.f, Math.max(0, Math.round(((s[col.f] || 0) + dir * col.step) * 100) / 100))
  }
  const eff3 = !!col3
  // Uses the shared stepper markup so a set row picks up the same control styling
  // as every other +/- field in the app.
  const cell = (s, i, col, cls) => (
    <div className={
      'flex items-center bg-surface-2 rounded-[10px] overflow-hidden min-w-0 ' + cls +
      (eff3 ? ' [&>button]:w-5' : ' [&>button]:w-8')
    }>
      <button aria-label="Decrease" onClick={() => bump(s, i, col, -1)} className="h-10 shrink-0 text-label text-[16px] flex items-center justify-center transition-colors duration-150 active:bg-surface-3 no-tap"><Icon name="minus" className="[--icon-stroke:2.2]" /></button>
      {/* a typed effort is capped — there is no RPE 12, and 12 reps in reserve is a warm-up */}
      <span className="flex-1 min-w-0 flex items-baseline justify-center gap-[3px] px-0.5">
        <NumberField decimal={col.dec} nullable={col.opt} value={s[col.f] ?? ''}
          onChange={v => onField(i, col.f, col.eff ? capEffort(col.eff, v) : v)} />
      </span>
      <button aria-label="Increase" onClick={() => bump(s, i, col, 1)} className="h-10 shrink-0 text-label text-[16px] flex items-center justify-center transition-colors duration-150 active:bg-surface-3 no-tap"><Icon name="plus" className="[--icon-stroke:2.2]" /></button>
    </div>
  )
  return (
    <div className="desk:grid desk:grid-cols-2 desk:gap-4 desk:items-start">
      {/* left: the movement — animation, name, context */}
      <div className="desk:min-w-0">
        <Media ex={ex} key={entry.id} compact={compact} minimizable />
        <div className="flex items-center justify-between mb-1.5">
          <div className={'font-semibold tracking-[-.02em] capitalize leading-[1.2] ' + (compact ? 'text-[17px]' : 'text-[20px]')}>{ex.n}</div>
          <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" aria-label={t('Details')} onClick={() => exerciseDetailSheet(ex)}><Icon name="info" /></button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {cardio && <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium"><Icon name="figureRun" />{t('Cardio')}</span>}
          {/* You log the total; this is the split, so the set in front of you is unambiguous
              without the rep count having to mean two different things (issue #31). */}
          {!cardio && !timed && isPerSide(cfg) && <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium">{t('{0} per side', fmtNum(sideReps(entry.sets.find(s => !s.done)?.r ?? entry.sets[0]?.r)))}</span>}
          {(ex.tg || ex.bp) && <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize">{t(ex.tg || ex.bp)}</span>}
          {ex.eq && <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize">{t(ex.eq)}</span>}
          {best > 0 && <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium">{t('Best:')} {fmtNum(best)} {S.unit}</span>}
        </div>
        {last && <div className="text-label-3 text-[13px] leading-[1.38] mb-1">{t('Last time')} ({fmtDate(last.d)}): {last.sets.map(s => setLabel(entry.id, s, last.target)).join(', ')}</div>}
        {plan && plan.why && plan.kind !== 'off' && <div className={'flex items-start gap-[7px] mt-1.5 mb-0.5 text-[13px] leading-[1.38] ' + (plan.kind === 'deload' ? 'text-yellow' : 'text-acc')}>
          <Icon name={plan.kind === 'up' ? 'arrowUp' : plan.kind === 'deload' ? 'arrowDown' : 'lightbulb'} className="shrink-0 mt-0.5" />
          <span>{t(...plan.why)}</span>
        </div>}
      </div>
      {/* right: the log — one card of set rows */}
      <div className="desk:min-w-0">
        <div className="bg-surface rounded-[14px] p-4 mt-2.5 mb-0 desk:mt-0">
          {/* the header carries the same eff3 sizing as the rows, or the labels drift off their columns */}
          <div className={'flex items-center pb-1.5 text-[11px] text-label-3 font-medium uppercase tracking-[.045em] ' + (eff3 ? 'gap-1.5' : 'gap-2')}>
            <span className="w-6 shrink-0" /><span className={eff3 ? 'flex-[1.2] text-center' : 'flex-[1.4] text-center'}>{col1.hd}</span>
            {col2 && <span className={eff3 ? 'flex-1 text-center' : 'flex-1 text-center'}>{col2.hd}</span>}
            {col3 && <span className="flex-[.85] text-center">{col3.hd}</span>}
            {timed && <span className="w-[30px] shrink-0" />}<span className="w-[30px] shrink-0" />
          </div>
          {entry.sets.map((s, i) => <div key={i} className={'flex items-center py-[7px] relative ' + (eff3 ? 'gap-1.5' : 'gap-2') + (s.done ? ' opacity-45' : '')}>
            {i > 0 && <span className="absolute left-8 right-0 top-0 h-[0.5px] bg-sep" />}
            <div className={'w-6 h-6 rounded-full bg-surface-2 text-label-2 flex items-center justify-center text-[12px] font-medium shrink-0 transition-colors duration-150 ' + (s.done ? 'bg-acc! text-on-acc!' : '')}>{i + 1}</div>
            {cell(s, i, col1, eff3 ? 'flex-[1.2]' : 'flex-[1.4]')}
            {col2 && cell(s, i, col2, 'flex-1')}
            {col3 && cell(s, i, col3, 'flex-[.85]')}
            {/* A timed set is started, not typed: the timer counts the hold down and checks the
                set off itself. The checkbox stays for anyone who timed it on their own watch. */}
            {timed && <button className="w-[30px] h-[30px] rounded-full shrink-0 flex items-center justify-center bg-surface-2 text-acc text-[14px] transition-[background-color,opacity] duration-150 disabled:opacity-30 disabled:cursor-default active:bg-surface-3 no-tap" aria-label={t('Start set')} disabled={s.done || !!working}
              onClick={() => onStartTimed(i)}><Icon name="play" /></button>}
            <Check checked={s.done} onChange={() => onToggle(i)} />
          </div>)}
          <div className="h-2" />
          <div className="flex items-center gap-3">
            <Button size="sm" icon="minus" disabled={entry.sets.length <= 1} onClick={onRemoveSet}>{t('Remove set')}</Button>
            <Button size="sm" icon="plus" onClick={onAddSet}>{t('Add set')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- active workout ---------- */
function ActiveWorkout() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const { startRest, stopRest } = useUI()
  const A = S.active
  const units = supersetUnits(A.entries)
  const cur = Math.min(A.cur, Math.max(0, A.entries.length - 1))
  const unit = A.entries.length ? unitOf(units, cur) : []
  const unitIdx = units.findIndex(u => u === unit)
  const isSuperset = unit.length > 1

  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  const done = setsDoneActive(A)

  const mutEntry = (idx, fn) => update(s => { fn(s.active.entries[idx]) }, true)
  // Clearing an optional field drops the key rather than storing null, so a set only carries
  // what was actually logged — in the session, in history and in a backup.
  const setField = (idx, i, field, v) => mutEntry(idx, e => {
    if (v == null) delete e.sets[i][field]; else e.sets[i][field] = v
  })
  const modeAt = idx => modeOf({ ...(A.entries[idx].target || {}), id: A.entries[idx].id })
  const addSet = idx => mutEntry(idx, e => {
    const l = e.sets[e.sets.length - 1]
    const m = modeOf({ ...(e.target || {}), id: e.id })
    if (m === 'cardio') e.sets.push({ min: l ? l.min : (e.target.min || 20), speed: l ? l.speed : (e.target.speed || 8), done: false })
    else if (m === 'time') e.sets.push({ sec: l ? l.sec : (e.target.sec || 45), w: l ? (l.w || 0) : (e.target.weight || 0), done: false })
    else e.sets.push({ w: l ? l.w : 0, r: l ? l.r : e.target.reps, done: false })
  })
  const removeSet = idx => mutEntry(idx, e => { if (e.sets.length > 1) e.sets.pop() })

  // A timed set is held, not typed. The work timer records what was actually held — an early
  // finish logs 0:38 of a 0:45 target rather than crediting the full prescription — and then
  // checks the set off through the normal path, so rest, supersets and the finish prompt all
  // behave exactly as they do for a reps set.
  const startTimed = (idx, i) => {
    const e = A.entries[idx]
    useUI.getState().startWork(e.sets[i].sec || 45, exOr(e.id).n, elapsed => {
      mutEntry(idx, en => { en.sets[i].sec = elapsed })
      if (!useStore.getState().S.active.entries[idx].sets[i].done) toggle(idx, i)
    })
  }

  const toggle = (idx, i) => {
    const m = modeAt(idx)
    const cardioEntry = m === 'cardio'
    const isLastUnit = unitIdx >= units.length - 1
    let askTop = false, exJustDone = false, workoutDone = false
    mutEntry(idx, e => {
      e.sets[i].done = !e.sets[i].done
      if (e.sets[i].done) {
        beep(S.sound, 1040, 0.12); vibrate(30)
        const isLastExInUnit = idx === unit[unit.length - 1]
        const unitDone = unit.every(ui => (ui === idx ? e : A.entries[ui]).sets.every(x => x.done))
        if (isLastExInUnit && !unitDone) startRest(S.restSec)
        else if (unitDone) stopRest()
        if (unitDone && isLastUnit) workoutDone = true      // last exercise's last set → done
        // Only loaded reps training has a "working weight" worth confirming — a bodyweight
        // plank has nothing to put in that slider, and neither does a set of push-ups
        // (issue #32: the fewest taps that still record what happened).
        const loaded = m === 'reps' && !(isBw({ ...(e.target || {}), id: e.id }) && !e.sets.some(x => x.w > 0))
        if (e.sets.every(x => x.done)) { exJustDone = true; if (loaded && !e.asked) { e.asked = true; askTop = true } }
      }
    })
    // reps: topWeight first (it chains into the finish/continue prompt on the last unit).
    // cardio/timed or already-confirmed: go straight to the prompt.
    if (askTop) topWeightSheet(idx)
    else if (workoutDone) workoutCompleteSheet()
    else if (exJustDone && cardioEntry) useUI.getState().toast(t('Cardio logged'))
    else if (exJustDone && m === 'time') useUI.getState().toast(t('Hold logged'))
  }

  // Live-presence heartbeat so the admin dashboard can show who's training now. Signed-in only —
  // guests have no server session. Reads fresh state each tick so progress stays current.
  useEffect(() => {
    if (!useStore.getState().user) return
    let stopped = false
    const ping = active => {
      const A2 = useStore.getState().S.active
      if (!A2) return
      const u = supersetUnits(A2.entries)
      const c = Math.min(A2.cur, Math.max(0, A2.entries.length - 1))
      const ui = u.findIndex(x => x.includes(c))
      const tot = A2.entries.reduce((n, e) => n + e.sets.length, 0)
      api('/api/activity', { method: 'POST', body: JSON.stringify({
        active, name: A2.name, exIdx: ui + 1, exTotal: u.length,
        setsDone: setsDoneActive(A2), setsTotal: tot, startedAt: A2.start
      }) }).catch(() => {})
    }
    ping(true)
    const iv = setInterval(() => { if (!stopped) ping(true) }, 20000)
    return () => {
      stopped = true; clearInterval(iv)
      // best-effort "left" signal: sendBeacon survives a tab close, fetch covers in-app nav
      try { navigator.sendBeacon?.('/api/activity', new Blob([JSON.stringify({ active: false })], { type: 'application/json' })) } catch { /* */ }
      api('/api/activity', { method: 'POST', body: JSON.stringify({ active: false }) }).catch(() => {})
    }
  }, [])

  return <div className="max-w-[640px] mx-auto desk:max-w-[1080px]">
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" aria-label={t('Discard')} onClick={() => confirmSheet({ title: t('Discard workout?'), message: t('The sets you logged in this session will be lost.'), confirmText: t('Discard'), danger: true, onConfirm: () => { update(s => { s.active = null }); stopRest(); nav('/home') } })}><Icon name="xmark" /></button>
      <div className="text-center"><div className="font-semibold">{A.name}</div><div className="text-label-2 text-[15px] tracking-[-.006em] mt-1"><Elapsed start={A.start} /> · {t('{0} sets', done + '/' + total)}</div></div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-acc flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" aria-label={t('Finish')} onClick={finishWorkout}><Icon name="check" /></button>
    </div>
    <div className="h-1 bg-surface-2 rounded-full overflow-hidden mb-4"><i className="block h-full bg-acc rounded-full transition-[width] duration-200 ease-[var(--ease)]" style={{ width: (total ? done / total * 100 : 0) + '%' }} /></div>

    {A.entries.length ? <>
      <div className="text-label-2 text-[13px] leading-[1.38] mb-1.5">{isSuperset ? t('Superset {0} / {1}', unitIdx + 1, units.length) : t('Exercise {0} / {1}', unitIdx + 1, units.length)}</div>
      {isSuperset ? (
        <div className="rounded-2xl p-3.5 bg-surface shadow-[inset_0_0_0_1.5px_var(--acc-line)]">
          <div className="text-[12px] font-semibold text-acc mb-3 text-center flex items-center justify-center gap-[5px]"><Icon name="link" className="text-[13px]" />{t('Superset · do these back-to-back, rest after both')}</div>
          {unit.map((idx, k) => <div key={idx} className="relative">
            {k > 0 && <div className="text-center text-[15px] font-semibold text-acc mt-3.5 mb-2">+</div>}
            <ExerciseBlock entryIdx={idx} compact
              onToggle={i => toggle(idx, i)} onField={(i, f, v) => setField(idx, i, f, v)} onAddSet={() => addSet(idx)} onRemoveSet={() => removeSet(idx)} onStartTimed={i => startTimed(idx, i)} />
          </div>)}
        </div>
      ) : (
        <ExerciseBlock entryIdx={cur} onToggle={i => toggle(cur, i)} onField={(i, f, v) => setField(cur, i, f, v)} onAddSet={() => addSet(cur)} onRemoveSet={() => removeSet(cur)} onStartTimed={i => startTimed(cur, i)} />
      )}
    </> : <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]"><div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="shuffle" /></div>{t('Freestyle workout — add your first exercise.')}</div>}

    <div className="h-3" />
    <div className="flex gap-3">
      <Button icon="chevronLeft" disabled={unitIdx <= 0} onClick={() => update(s => { s.active.cur = units[unitIdx - 1][0] })}>{t('Prev')}</Button>
      <Button trailingIcon="chevronRight" disabled={unitIdx < 0 || unitIdx >= units.length - 1} onClick={() => update(s => { s.active.cur = units[unitIdx + 1][0] })}>{t('Next')}</Button>
    </div>
    <div className="h-2.5" />
    <Button onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => update(s => {
      const full = { ...cfg, id: ex.id }
      const plan = nextPrescription(s, full, s.routines.find(r => r.id === s.active.routineId))
      s.active.entries.push({ id: ex.id, target: { ...cfg }, plan, sets: applyPrescription(buildSets(s, full), plan) })
      s.active.cur = s.active.entries.length - 1
    }), null, S.routines.find(r => r.id === A.routineId)))} icon="plus">{t('Add exercise')}</Button>
    <div className="h-2.5" />
    {(() => {
      const exDone = A.entries.filter(e => e.sets.length && e.sets.every(s => s.done)).length
      const allDone = A.entries.length > 0 && exDone === A.entries.length
      return <button className={'inline-flex items-center justify-center gap-[7px] w-full px-[18px] py-[14px] rounded-xl text-[17px] font-semibold tracking-[-.012em] no-tap transition-[transform,background-color,opacity] duration-150 ease-[var(--ease)] active:scale-[.975] ' + (allDone ? 'bg-acc text-on-acc active:bg-acc-2' : 'bg-transparent text-acc font-normal text-label-3')}>
        {allDone ? t('Finish workout') : t('Finish workout early · {0} exercises', exDone + '/' + A.entries.length)}
      </button>
    })()}
    <div className="h-10" />
  </div>
}

export default function Workout() {
  const active = useStore(s => s.S.active)
  return active ? <ActiveWorkout /> : <StartChooser />
}

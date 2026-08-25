import { useEffect, useRef, useState } from 'react'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { EXDB, EXIDX, BODYPARTS, isCardio, isBodyweightEq, allExercises, equipmentOf } from './lib/exercises.js'
import { fmtDate, fmtNum, fmtVol, fmtDur, durPart, todayISO, uid, exCount, DAYN, MONTHS_LONG, ACCENTS } from './lib/format.js'
import { lastEntryFor, bestWeightFor, buildSets, effectiveRoutineId, workoutVolume, setsDone, setsDoneActive, lastBW, supersetUnits, unitOf, setLabel, defaultConfig, cleanupSg, modeOf, effortOf, isBw, isPerSide, sideReps } from './lib/history.js'
import { beep, vibrate } from './lib/sound.js'
import { t, instrFor, getLang, INSTR_LANGS } from './lib/i18n.js'
import { nav } from './lib/nav.js'
import { starterRoutines } from './lib/starter.js'
import Media, { Thumb } from './components/Media.jsx'
import Stepper from './components/Stepper.jsx'
import Icon from './components/Icon.jsx'
import { Button, Slider, Switch, Segmented, SelectRow, Row } from './components/ui.jsx'
import { glyphOf, GLYPH_GROUPS, DEFAULT_GLYPH } from './lib/glyphs.js'
import BodyMap from './components/BodyMap.jsx'
import { loadOfWorkouts } from './lib/muscles.js'
import { parseImport, mergeImport } from './lib/import-csv.js'
import { buildPlanBundle, parsePlan, mergePlan, printPlan } from './lib/plan-share.js'
import { estimate1RM, best1RM, is1RMRecord, REP_CAP } from './lib/onerm.js'
import { nextPrescription, applyPrescription, policyFor, defaultIncrement, POLICIES_FOR, POLICY_NAME, POLICY_DESC, MAX_BW_SETS } from './lib/progression.js'

const S = () => useStore.getState().S
const update = (...a) => useStore.getState().update(...a)
const ui = () => useUI.getState()
const toast = m => ui().toast(m)
const snd = () => S().sound

/* ---- shared class snippets ---- */
const H3 = 'text-[20px] font-semibold tracking-[-.021em] mb-3.5'
const SEC = 'text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1'
const MUTED_S = 'text-label-2 text-[13px] leading-[1.38]'
const DIM_S = 'text-label-3 text-[13px] leading-[1.38]'
const INPUT = 'w-full bg-surface rounded-xl px-[15px] py-[13px] text-[17px] tracking-[-.012em] outline-none border-0 placeholder:text-label-3 focus:shadow-[inset_0_0_0_2px_var(--acc)]'
const ITEM = 'flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer'
const TT = 'text-[16px] font-normal leading-[1.25] tracking-[-.009em]'
const SS = 'text-label-2 text-[13px] mt-0.5'
const CHEV = 'text-label shrink-0 text-[15px] [--icon-stroke:2.4]'
const TAG = 'inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium'
const TAG_ACC = 'inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium'
const ICONBTN = 'rounded-full shrink-0 bg-surface text-label flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap'
const TILE_L = 'text-label-2 text-[13px] font-normal tracking-[-.004em]'
const TILE_V = 'font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]'
const LROW_I = 'w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white bg-acc'

/* ============================ custom confirm dialog ============================ */
function ConfirmDialog({ title, message, confirmText, cancelText, danger, onConfirm, close }) {
  return <div className="text-center py-1">
    {title && <h3 className={H3 + ' mb-2'}>{title}</h3>}
    <div className="text-label-2 mb-[18px] leading-[1.5]">{message}</div>
    <Button variant={danger ? 'danger' : 'primary'} onClick={() => { close(); onConfirm && onConfirm() }}>{confirmText || t('Confirm')}</Button>
    <div className="h-2" />
    <Button variant="ghost" className="text-label-3!" onClick={close}>{cancelText || t('Cancel')}</Button>
  </div>
}
// Themed replacement for window.confirm — callback-based (no blocking).
export function confirmSheet(opts) {
  ui().openSheet(close => <ConfirmDialog {...opts} close={close} />, { kind: 'center' })
}

/* ============================ starter plan ============================ */
export function loadStarterPlan() {
  const [push, pull, legs] = starterRoutines()
  update(st => {
    st.routines.push(push, pull, legs)
    st.week[1] = push.id; st.week[3] = pull.id; st.week[5] = legs.id
  })
  toast(t('Starter plan loaded — Mon Push · Wed Pull · Fri Legs'))
}

/* ============================ weight picker (shared: body weight + goal) ============================ */
// Fixed range, not a moving window — a window that resizes itself mid-drag (the previous
// attempt) makes the thumb's position unpredictable: every time it grows, everything already
// placed on it shifts toward one side. A static range never has that problem, at the cost of
// coarser precision per pixel — the +/- buttons cover exact values.
// The ceiling follows the profile's unit: 300 covers a body weight or a working weight in
// kg, but as pounds it cut off at 136 kg — below plenty of people's body weight, and well
// below an everyday squat.
const W_LO = 1
const wHi = unit => (unit === 'lb' ? 660 : 300)
function WeightInput({ value, setValue, unit }) {
  const W_HI = wHi(unit)
  const clamp = x => Math.max(W_LO, Math.min(W_HI, Math.round((x || 0) * 10) / 10))
  const sv = Math.max(W_LO, Math.min(W_HI, value))
  const onSlide = v => setValue(clamp(v))
  return <>
    <div className="flex items-center justify-center gap-[18px] mt-3.5 mb-1.5">
      <button className="w-[46px] h-[46px] rounded-full bg-surface shrink-0 text-label flex items-center justify-center text-[19px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap [--icon-stroke:2.2]" onClick={() => onSlide(value - 0.1)} aria-label="minus 0.1"><Icon name="minus" /></button>
      <div className="text-[52px] font-semibold tracking-[-.035em] min-w-[158px] text-center tabular-nums leading-none">{fmtNum(value)}<span className="text-[19px] text-label-2 font-normal tracking-[-.01em]"> {unit}</span></div>
      <button className="w-[46px] h-[46px] rounded-full bg-surface shrink-0 text-label flex items-center justify-center text-[19px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap [--icon-stroke:2.2]" onClick={() => onSlide(value + 0.1)} aria-label="plus 0.1"><Icon name="plus" /></button>
    </div>
    <div className="flex gap-[7px] justify-center my-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button className="shrink-0 px-[13px] py-1.5 rounded-full bg-surface text-[14px] text-label transition-colors duration-150 no-tap active:bg-surface-2" onClick={() => onSlide(value - 1)}>−1</button>
      <button className="shrink-0 px-[13px] py-1.5 rounded-full bg-surface text-[14px] text-label transition-colors duration-150 no-tap active:bg-surface-2" onClick={() => onSlide(value - 0.5)}>−0.5</button>
      <button className="shrink-0 px-[13px] py-1.5 rounded-full bg-surface text-[14px] text-label transition-colors duration-150 no-tap active:bg-surface-2" onClick={() => onSlide(value + 0.5)}>+0.5</button>
      <button className="shrink-0 px-[13px] py-1.5 rounded-full bg-surface text-[14px] text-label transition-colors duration-150 no-tap active:bg-surface-2" onClick={() => onSlide(value + 1)}>+1</button>
    </div>
    <Slider value={sv} min={W_LO} max={W_HI} step={0.5} onChange={onSlide} />
  </>
}

/* ============================ body weight ============================ */
function BwSheet({ required, onDone, close }) {
  const st = useStore(s => s.S)
  const unit = st.unit
  const bw = lastBW(st)
  const [v, setV] = useState(bw ? bw.w : 70)
  const save = () => {
    const n = Math.round((v || 0) * 10) / 10
    if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
    update(s => {
      const iso = todayISO()
      const ex = s.bodyweight.find(b => b.d === iso)
      if (ex) { ex.w = n; ex.t = Date.now() } else s.bodyweight.push({ d: iso, w: n, t: Date.now() })
      s.bodyweight.sort((a, b) => (a.d < b.d ? -1 : 1))
    })
    close()
    if (onDone) onDone(n); else toast(t('Weight saved'))
  }
  const recent = [...st.bodyweight].reverse().slice(0, 3)
  const delEntry = d => update(s => { s.bodyweight = s.bodyweight.filter(b => b.d !== d) })
  return <>
    <h3 className={H3}>{required ? t('Quick check-in') : t('Log body weight')}</h3>
    <div className={MUTED_S}>{required ? t('Slide or tap to set your weight — tracked before every workout so your curve stays honest.') : t('Today') + ', ' + fmtDate(todayISO(), true)}</div>
    <WeightInput value={v} setValue={setV} unit={unit} />
    <div className="h-3.5" />
    <Button variant="primary" onClick={save}>{required ? t('Save & start workout') : t('Save')}</Button>
    {required && <>
      <div className="h-2" /><Button variant="ghost" className="text-label-3!" onClick={() => { close(); onDone && onDone(null) }}>{t('Start without weighing in')}</Button>
      <div className="h-0.5" /><Button variant="ghost" className="text-label-3!" icon="reset" onClick={() => { close(); nav('/workout') }}>{t('Choose a different workout')}</Button>
    </>}
    {!required && recent.length > 0 && <>
      <h4 className={SEC}>{t('Recent weigh-ins')}</h4>
      <div className="flex flex-col">
        {recent.map(b => <div key={b.d} className="flex items-center justify-between py-[9px] px-0.5 border-b border-sep">
          <span className={MUTED_S}>{fmtDate(b.d, true)}</span>
          <span className="flex items-center gap-3"><b>{fmtNum(b.w)} {unit}</b>
            <button className="w-8 h-[30px] rounded-lg shrink-0 bg-surface text-[15px] text-red flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => delEntry(b.d)} aria-label="delete"><Icon name="trash" /></button></span>
        </div>)}
      </div>
    </>}
  </>
}
export function bwSheet(opts = {}) {
  const h = ui().openSheet(close => <BwSheet {...opts} close={close} />, { locked: !!opts.required })
  return h
}

/* ============================ import from another app ============================ */
// Shows what a parsed export would actually do before anything is written. An import is
// the one action where "just try it" is expensive — it's someone's entire training
// history — so the numbers, the unit conversion and the exercises we couldn't recognise
// are all on screen before the confirm button.
function ImportSummary({ parsed, close }) {
  const st = useStore(s => s.S)
  const isBW = parsed.kind === 'bodyweight'
  const have = isBW
    ? parsed.bodyweight.filter(b => st.bodyweight.some(x => x.d === b.d)).length
    : parsed.workouts.filter(w => st.workouts.some(x => x.d === w.d)).length
  const fresh = (isBW ? parsed.bodyweight.length : parsed.workouts.length) - have

  const doImport = () => {
    let res
    update(s => { res = mergeImport(s, parsed) })
    close()
    toast(isBW
      ? t('{0} weigh-ins imported', res.added)
      : t('{0} workouts imported', res.added))
  }

  return <>
    <h3 className={H3}>{parsed.source ? t('Import from {0}', parsed.source) : t('Import history')}</h3>
    <div className={MUTED_S + ' mb-3'}>
      {parsed.from === parsed.to ? fmtDate(parsed.from, true) : fmtDate(parsed.from, true) + ' – ' + fmtDate(parsed.to, true)}
    </div>

    <div className="grid grid-cols-2 gap-2.5 mb-3 text-left">
      {isBW ? <>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Weigh-ins')}</div><div className={TILE_V + ' text-[17.6px]'}>{parsed.bodyweight.length}</div></div>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('New')}</div><div className={TILE_V + ' text-[17.6px]'}>{fresh}</div></div>
      </> : <>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Workouts')}</div><div className={TILE_V + ' text-[17.6px]'}>{parsed.workouts.length}</div></div>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Sets')}</div><div className={TILE_V + ' text-[17.6px]'}>{parsed.sets}</div></div>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Exercises matched')}</div><div className={TILE_V + ' text-[17.6px]'}>{parsed.matched}</div></div>
        <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Added as your own')}</div><div className={TILE_V + ' text-[17.6px]'}>{parsed.created}</div></div>
      </>}
    </div>

    {parsed.mixedUnits ? <div className="text-[13px] leading-[1.38] text-yellow mb-2.5">
      {t('The file mixes kg and lb — each set is converted to {0}.', st.unit)}
    </div> : parsed.converted ? <div className="text-[13px] leading-[1.38] text-yellow mb-2.5">
      {t('The file is in {0} and your profile is in {1} — weights will be converted.', parsed.fileUnit, st.unit)}
    </div> : null}
    {!isBW && !parsed.fileUnit && !parsed.mixedUnits && <div className={DIM_S + ' mb-2.5'}>
      {t('The file does not say which unit it uses — numbers are imported as they are.')}
    </div>}
    {have > 0 && <div className={DIM_S + ' mb-2.5'}>
      {t('{0} days already have data here and will be left alone.', have)}
    </div>}
    {/* The file rated its sets. Say so: the column is off by default, so the ratings would
        otherwise arrive invisibly and look like they had been dropped. */}
    {!isBW && (parsed.rirSets + parsed.rpeSets) > 0 && <div className={DIM_S + ' mb-2.5'}>
      {t(effortOf(st) === 'none'
        ? '{0} sets bring an {1} with them — switch on Effort per set in Settings to see it.'
        : '{0} sets bring an {1} with them.',
      parsed.rirSets || parsed.rpeSets, parsed.rirSets ? 'RIR' : 'RPE')}
    </div>}
    {!isBW && parsed.unmatchedNames.length > 0 && <>
      <h4 className={SEC}>{t('Not in the library — added as your own exercises')}</h4>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {parsed.unmatchedNames.slice(0, 12).map(n => <span key={n} className="text-[12px] px-[9px] py-1 rounded-full bg-surface-2 text-label-2 capitalize">{n}</span>)}
        {parsed.unmatchedNames.length > 12 && <span className="text-[12px] px-[9px] py-1 rounded-full bg-surface-2 text-label-2">+{parsed.unmatchedNames.length - 12}</span>}
      </div>
    </>}

    <Button variant="primary" onClick={doImport} disabled={!fresh}>
      {fresh ? t('Import') : t('Nothing new to import')}
    </Button>
    <div className="h-2" />
    <Button variant="ghost" className="text-label-3!" onClick={close}>{t('Cancel')}</Button>
  </>
}

/** Read a CSV/XML export, then show what it would do. */
export function importFromApp(file, onDone) {
  const rd = new FileReader()
  rd.onload = () => {
    let parsed
    try { parsed = parseImport(String(rd.result), { unit: S().unit }) }
    catch (e) { toast(t('Could not read that file')); return }
    if (parsed.error === 'empty') { toast(t('That file is empty')); return }
    if (parsed.error) { toast(t("That file's columns aren't recognised — see the docs for supported apps.")); return }
    if (parsed.kind === 'bodyweight' ? !parsed.bodyweight.length : !parsed.workouts.length) {
      toast(t('Nothing to import from that file')); return
    }
    ui().openSheet(close => <ImportSummary parsed={parsed} close={close} />)
    onDone && onDone()
  }
  rd.onerror = () => toast(t('Could not read that file'))
  rd.readAsText(file)
}

/* ============================ target weight ============================ */
export function bwDeltaColor(delta, currentW) {
  if (!delta) return 'var(--label-2)'
  if (!S().targetW) return 'var(--label)'
  const up = S().targetW > currentW
  return (delta > 0) === up ? 'var(--acc)' : 'var(--red)'
}
function GoalSheet({ close }) {
  const st = S()
  const bw = lastBW(st)
  const [v, setV] = useState(st.targetW || (bw ? bw.w : 70))
  return <>
    <h3 className={H3}>{t('Target weight')}</h3>
    <div className={MUTED_S}>{t('Your goal is drawn as a line through the weight charts, and gains/losses are colored by whether they move toward it.')}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div className="h-3.5" />
    <Button variant="primary" onClick={() => {
      const n = Math.round((v || 0) * 10) / 10
      if (!n || n <= 0) { toast(t('Enter a valid weight')); return }
      update(s => { s.targetW = n }); close()
      const b = lastBW(S()); toast(t('Goal set: {0}', fmtNum(n) + ' ' + st.unit) + (b ? ' (' + t('{0} to go', fmtNum(Math.abs(n - b.w))) + ')' : ''))
    }}>{t('Save goal')}</Button>
    {st.targetW && <><div className="h-2" /><Button variant="danger" onClick={() => { update(s => { s.targetW = null }); close(); toast(t('Goal removed')) }}>{t('Remove goal')}</Button></>}
  </>
}
export const goalSheet = () => ui().openSheet(close => <GoalSheet close={close} />)

/* ============================ exercise detail ============================ */
// Estimated 1RM for one exercise (issue #18): what the log already implies, plus a calculator
// for a set you have not done — so the number is reachable before there is any history.
function OneRM({ ex }) {
  const st = useStore(s => s.S)
  const best = best1RM(st, ex.id)
  const [w, setW] = useState(best ? best.w : (st.exWeights[ex.id] || {}).w || 20)
  const [r, setR] = useState(best ? best.r : 5)
  const est = estimate1RM(w, r)
  return <>
    <h4 className={SEC}>{t('Estimated 1RM')}</h4>
    {best && <div className="text-[13px] leading-[1.38] mb-2">
      {t('From your log:')} <b className="text-acc">{fmtNum(best.est)} {st.unit}</b>
      <span className="text-label-3"> · {t('{0} × {1} on {2}', fmtNum(best.w) + ' ' + st.unit, best.r, fmtDate(best.d, true))}</span>
    </div>}
    <div className="flex gap-2 [&>div]:flex-1 [&>div]:min-w-0 mb-2.5">
      <Stepper label={t('Weight ({0})', st.unit)} value={w} step={2.5} onChange={setW} className="[&>button]:w-[30px]" />
      <Stepper label={t('Reps')} value={r} step={1} decimal={false} onChange={setR} className="[&>button]:w-[30px]" />
    </div>
    <div className="flex items-center justify-between mb-1">
      <span className={MUTED_S}>{t('Estimate')}</span>
      <b className="text-acc text-[20px]">{est === null ? '—' : fmtNum(est) + ' ' + st.unit}</b>
    </div>
    <div className={DIM_S}>{est === null
      ? t('Enter a weight and 1–{0} reps — beyond that an estimate is guesswork.', REP_CAP)
      : t('Epley formula — a calculation from one set, not a tested max.')}</div>
  </>
}

function ExerciseDetail({ ex, close }) {
  const st = useStore(s => s.S)
  const last = lastEntryFor(st, ex.id)
  const best = bestWeightFor(st, ex.id)
  return <>
    <h3 className={H3 + ' capitalize'}>{ex.n}</h3>
    <Media ex={ex} />
    <div className="flex items-center gap-1.5 flex-wrap my-2.5">
      <span className={TAG_ACC}>{t(ex.bp)}</span>
      {ex.tg && <span className={TAG}><Icon name="target" />{t(ex.tg)}</span>}
      <span className={TAG}><Icon name="dumbbell" />{t(ex.eq)}</span>
      {(ex.sm || []).slice(0, 3).map((s, i) => <span key={i} className={TAG}>{t(s)}</span>)}
    </div>
    {ex.desc && <div className="bg-surface rounded-xl px-[15px] py-[13px] leading-[1.45] whitespace-pre-wrap text-[15px] mb-2.5 text-label-2">{ex.desc}</div>}
    {best > 0 && <div className="flex items-center gap-[5px] text-[13px] leading-[1.38] mb-1.5"><Icon name="trophy" className="text-[14px] text-yellow" />{t('Best:')} <b className="text-acc">{fmtNum(best)} {st.unit}</b>{last ? ` · ${t('last')} ${fmtDate(last.d)}: ${last.sets.map(s => setLabel(ex.id, s, last.target)).join(', ')}` : ''}</div>}
    <Button variant="primary" icon="plus" className="my-2.5 mb-1!" onClick={() => addToRoutineSheet(ex)}>{t('Add to my plan')}</Button>
    {ex.custom && <div className="flex gap-2 mt-2">
      <Button icon="pencil" className="flex-1!" onClick={() => { close(); customExSheet(ex) }}>{t('Edit')}</Button>
      <Button variant="danger" icon="trash" className="flex-1!" onClick={() => deleteCustomEx(ex, close)}>{t('Delete')}</Button>
    </div>}
    {!isCardio(ex) && <OneRM ex={ex} />}
    {instrFor(ex).length > 0 && <><h4 className={SEC}>{t('How to')}{!INSTR_LANGS.includes(getLang()) && <span className="text-label-3 normal-case! tracking-normal!"> · {t('instructions in English')}</span>}</h4><ol className="pl-[18px] text-label-2 text-[15px] leading-[1.5] flex flex-col gap-[9px] list-decimal [&::marker]:text-label-3">{instrFor(ex).map((s, i) => <li key={i}>{s}</li>)}</ol></>}
  </>
}
export const exerciseDetailSheet = ex => ui().openSheet(close => <ExerciseDetail ex={ex} close={close} />)

/* ============================ add to routine ============================ */
function AddToRoutine({ ex, close }) {
  const st = useStore(s => s.S)
  const pick = rid => {
    close()
    const isNew = rid === '_new'
    exConfigSheet(ex, null, cfg => {
      update(s => {
        let r = isNew ? { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] } : s.routines.find(x => x.id === rid)
        if (isNew) s.routines.push(r)
        if (r) r.ex.push({ id: ex.id, ...cfg })
      })
      const r = isNew ? S().routines[S().routines.length - 1] : st.routines.find(x => x.id === rid)
      toast(t('“{0}” added to {1}', ex.n, r ? r.name : t('routine')))
      if (isNew && r) nav('/plan/r/' + r.id)
    }, null, isNew ? null : st.routines.find(x => x.id === rid))
  }
  return <>
    <h3 className={H3 + ' capitalize'}>{t('Add “{0}”', ex.n)}</h3>
    <div className={MUTED_S + ' mb-3'}>{t('Pick a routine — sets, reps & weight come next.')}</div>
    <div className="flex flex-col gap-2">
      {st.routines.map(r => <div key={r.id} className={ITEM} onClick={() => pick(r.id)}>
        <span className={LROW_I}><Icon name={glyphOf(r.emoji)} /></span>
        <div className="flex-1 min-w-0"><div className={TT}>{r.name}</div><div className={SS}>{exCount(r.ex.length)}</div></div>
        {r.ex.some(e => e.id === ex.id) && <span className={TAG}>{t('already in')}</span>}<Icon name="plus" className={CHEV} />
      </div>)}
      <div className={ITEM} onClick={() => pick('_new')}><span className={LROW_I + ' bg-surface-3!'}><Icon name="sparkles" /></span>
        <div className="flex-1 min-w-0"><div className={TT}>{t('New routine')}</div><div className={SS}>{t('Create one and start with this exercise')}</div></div><Icon name="plus" className={CHEV} /></div>
    </div>
  </>
}
export const addToRoutineSheet = ex => ui().openSheet(close => <AddToRoutine ex={ex} close={close} />)

/* ============================ custom exercises (issue #11) ============================ */
// Name + body part is all it takes — the exercise then behaves like any built-in one
// (planning, logging, PRs, stats), just without an animation.
function CustomExForm({ existing, prefill, onDone, close }) {
  const [n, setN] = useState(existing ? existing.n : (prefill || ''))
  const [bp, setBp] = useState(existing ? existing.bp : '')
  const [desc, setDesc] = useState(existing ? (existing.desc || '') : '')
  const save = () => {
    const name = n.trim()
    if (!name) { toast(t('Give it a name')); return }
    if (!bp) { toast(t('Pick a body part')); return }
    const dup = allExercises(S()).find(e => e.n.toLowerCase() === name.toLowerCase() && e.id !== (existing || {}).id)
    if (dup) { toast(t('“{0}” already exists', dup.n)); return }
    const d = desc.trim().slice(0, 1000)
    let id = existing && existing.id
    if (existing) update(s => { const c = (s.customEx || []).find(x => x.id === id); if (c) { c.n = name; c.bp = bp; c.desc = d } })
    else {
      id = 'c' + uid()
      update(s => { (s.customEx = s.customEx || []).push({ id, n: name, bp, desc: d, tg: '', eq: 'custom', custom: true }) })
    }
    close()
    toast(existing ? t('Saved') : t('“{0}” created', name))
    onDone && onDone(EXIDX[id])
  }
  return <>
    <h3 className={H3}>{existing ? t('Edit custom exercise') : t('Create your own exercise')}</h3>
    <div className={MUTED_S + ' mb-3'}>{t('Name it and pick a body part — it behaves like any other exercise, just without an animation.')}</div>
    <input className={INPUT} placeholder={t('Exercise name')} value={n} onChange={e => setN(e.target.value)} />
    <div className="flex gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden my-3">
      {BODYPARTS.map(b => <button key={b} className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] capitalize transition-colors duration-150 no-tap ' + (bp === b ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => setBp(b)}>{t(b)}</button>)}
    </div>
    {bp === 'cardio' && <div className="flex items-center gap-[5px] text-[13px] leading-[1.38] text-label-3 mb-2.5"><Icon name="figureRun" className="text-[13px]" />{t('Cardio exercises log time + speed instead of weight × reps.')}</div>}
    <textarea className={INPUT + ' min-h-[92px] resize-y leading-[1.42]'} rows={4} maxLength={1000} placeholder={t('Description (optional) — setup, cues, anything you want to remember')}
      value={desc} onChange={e => setDesc(e.target.value)} />
    <div className="h-3.5" />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Create exercise')}</Button>
    {existing && <><div className="h-2" /><Button variant="danger" icon="trash" onClick={() => { close(); deleteCustomEx(existing) }}>{t('Delete exercise')}</Button></>}
  </>
}
export const customExSheet = (existing, onDone, prefill) => ui().openSheet(close => <CustomExForm existing={existing} prefill={prefill} onDone={onDone} close={close} />)

export function deleteCustomEx(ex, afterDelete) {
  if (S().active?.entries.some(e => e.id === ex.id)) { toast(t('Finish your current workout first')); return }
  confirmSheet({
    title: t('Delete “{0}”?', ex.n),
    message: t('It will be removed from your routines. Already-logged workouts keep their sets.'),
    confirmText: t('Delete'), danger: true,
    onConfirm: () => {
      update(s => {
        s.customEx = (s.customEx || []).filter(x => x.id !== ex.id)
        s.routines.forEach(r => { r.ex = r.ex.filter(e => e.id !== ex.id); cleanupSg(r.ex) })
        // stamp the name into history entries so past workouts stay readable
        s.workouts.forEach(w => w.entries.forEach(e => { if (e.id === ex.id) e.n = ex.n }))
        delete s.exWeights[ex.id]
      })
      toast(t('Exercise deleted'))
      afterDelete && afterDelete()
    }
  })
}

/* ============================ exercise picker ============================ */
// Exercises already used in your routines or past workouts (for the "Chosen" filter + a marker).
function usageMap(st) {
  const u = {}
  st.routines.forEach(r => r.ex.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  st.workouts.forEach(w => w.entries.forEach(e => { u[e.id] = (u[e.id] || 0) + 1 }))
  return u
}
function ExercisePicker({ onPick, close }) {
  const st = useStore(s => s.S)
  const usage = usageMap(st)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')          // '' = all, '★' = chosen, else a body part
  const [eq, setEq] = useState('')          // '' = any equipment
  const [shown, setShown] = useState(50)
  const ql = q.toLowerCase().trim()
  const all = allExercises(st)
  let base = all.filter(e =>
    (bp === '★' ? usage[e.id] : (!bp || e.bp === bp)) &&
    (!ql || e.n.toLowerCase().includes(ql) || e.tg.includes(ql) || e.eq.includes(ql) || (e.desc || '').toLowerCase().includes(ql)))
  if (bp === '★') base = [...base].sort((a, b) => (usage[b.id] - usage[a.id]) || (a.n < b.n ? -1 : 1))
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base
  const chosenCount = Object.keys(usage).length
  return <>
    <h3 className={H3}>{t('Add exercise')}</h3>
    <div className="relative flex items-center">
      <svg viewBox="0 0 24 24" className="absolute left-[11px] top-1/2 -translate-y-1/2 z-[1] w-4 h-4 stroke-label-3 fill-none [stroke-width:2.1] [stroke-linecap:round]"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className={INPUT + ' bg-surface-2! rounded-[10px]! pl-[35px]!'} placeholder={t('Search {0} exercises…', all.length)} value={q} onChange={e => { setQ(e.target.value); setShown(50) }} />
    </div>
    <div className={'flex gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' + (eqOpts.length > 1 ? 'mt-2.5 mb-1.5' : 'mt-2.5')}>
      {chosenCount > 0 && <button className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] transition-colors duration-150 no-tap ' + (bp === '★' ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setBp('★'); setEq(''); setShown(50) }}><Icon name="starFill" className="text-[12px] inline-block mr-1 align-[-1px]" />{t('Chosen')} ({chosenCount})</button>}
      <button className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] transition-colors duration-150 no-tap ' + (!bp ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setBp(''); setEq(''); setShown(50) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] capitalize transition-colors duration-150 no-tap ' + (bp === b ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setBp(b); setEq(''); setShown(50) }}>{t(b)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="flex gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-2.5">
      <button className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] transition-colors duration-150 no-tap ' + (!eqOn ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setEq(''); setShown(50) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] capitalize transition-colors duration-150 no-tap ' + (eqOn === x ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setEq(x); setShown(50) }}>{t(x)}</button>)}
    </div>}
    <div className="flex flex-col gap-2">
      {bp !== '★' && <div className={ITEM} onClick={() => customExSheet(null, ex => onPick(ex), q.trim())}>
        <div className="w-[50px] h-[50px] rounded-[9px] shrink-0 flex items-center justify-center text-[21px] bg-surface-2 text-label-2"><Icon name="sparkles" /></div>
        <div className="flex-1 min-w-0"><div className={TT}>{t('Create your own exercise')}</div><div className={SS}>{t('name + body part, no animation')}</div></div><Icon name="plus" className={CHEV} />
      </div>}
      {f.slice(0, shown).map(e => <div key={e.id} className={ITEM} onClick={() => onPick(e)}>
        <Thumb ex={e} /><div className="flex-1 min-w-0"><div className={TT + ' capitalize'}>{e.n}</div><div className={SS + ' capitalize'}>{t(e.tg || e.bp)} · {t(e.eq)}</div></div>
        {usage[e.id] && <span className={TAG_ACC}><Icon name="starFill" /></span>}<Icon name="plus" className={CHEV} />
      </div>)}
      {f.length === 0 && bp === '★' && <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]">{t('Nothing chosen yet — add exercises and they’ll show up here.')}</div>}
    </div>
    {f.length > shown && <><div className="h-2" /><Button onClick={() => setShown(s => s + 50)}>{t('Show more')}</Button></>}
  </>
}
export const exercisePicker = onPick => ui().openSheet(close => <ExercisePicker onPick={onPick} close={close} />)

/* ============================ exercise config ============================ */
// Progression settings for one exercise (issue #17). Shown inside the config sheet because
// "how does this lift go up" belongs next to sets and reps, not in a separate screen. Left
// on "follow the routine" it inherits, so most people never touch it.
function ProgressionFields({ ex, mode, c, setC, routine, unit }) {
  const options = POLICIES_FOR[mode] || ['off']
  if (options.length < 2) return null
  const inherited = policyFor({ id: ex.id }, routine, mode)
  const active = policyFor({ ...c, id: ex.id }, routine, mode)
  const inc = c.inc > 0 ? c.inc : (mode === 'time' ? 5 : defaultIncrement(ex.id, unit))
  return <>
    <h4 className={SEC}>{t('Progression')}</h4>
    <div className="bg-surface rounded-[14px] overflow-hidden mb-2">
      <SelectRow title={t('Rule')} sheetTitle={t('Progression')} value={c.prog || ''} onChange={v => setC(x => ({ ...x, prog: v || undefined }))}
        options={[{ value: '', label: t('Follow the routine ({0})', t(POLICY_NAME[inherited])) },
          ...options.map(p => ({ value: p, label: t(POLICY_NAME[p]) }))]} />
    </div>
    <div className={(active === 'off' ? 'mb-[18px] ' : 'mb-[10px] ') + DIM_S}>{t(POLICY_DESC[active])}</div>
    {active !== 'off' && <div className="flex gap-2 [&>div]:flex-1 [&>div]:min-w-0 mb-[18px]">
      <Stepper label={mode === 'time' ? t('Step (seconds)') : t('Step ({0})', unit)} value={inc}
        step={mode === 'time' ? 5 : 1.25} decimal={mode !== 'time'} onChange={v => setC(x => ({ ...x, inc: v }))} className="[&>button]:w-[30px]" />
      {active === 'double' && <Stepper label={t('Reps from')} value={c.repsMin || Math.max(1, (c.reps || 10) - 2)}
        step={1} decimal={false} onChange={v => setC(x => ({ ...x, repsMin: v }))} className="[&>button]:w-[30px]" />}
    </div>}
  </>
}

function ExConfig({ ex, existing, onSave, onDelete, close, routine }) {
  const st = useStore(s => s.S)
  const cardio = isCardio(ex.id)
  const [c, setC] = useState(existing || defaultConfig(ex.id))
  // Cardio keeps its own duration+speed form; the reps/time choice (issue #16) is offered for
  // everything else, which is where the gap was — planks, hangs, wall sits, loaded carries.
  const mode = cardio ? 'cardio' : modeOf({ ...c, id: ex.id })
  // Both default from the dataset and are then whatever the config says — see isBw.
  const bw = !cardio && isBw({ ...c, id: ex.id })
  const perSide = isPerSide(c)
  // Keep whatever the other mode already had (sets, weight) and fill only what is missing.
  const setMode = m => setC(x => ({ ...defaultConfig(ex.id, m), ...x, mode: m }))
  const save = () => {
    close()
    const sets = Math.max(1, Math.round(c.sets) || (cardio ? 1 : 3))
    // Only carry progression settings that differ from the inherited default, so a plan file
    // stays readable and "follow the routine" keeps meaning exactly that.
    const prog = {}
    if (c.prog) prog.prog = c.prog
    if (c.inc > 0) prog.inc = c.inc
    // Written only when it differs from what the dataset already says, so a barbell config
    // stays exactly the shape it was before these flags existed.
    // `bodyweight` is true of a hold as much as of a set of reps; `side` is not — it counts
    // reps, and a timed hold has none. Switching an exercise to Time therefore drops it
    // rather than carrying a flag nothing downstream can read.
    const flags = {}
    if (bw !== isBodyweightEq(ex.id)) flags.bodyweight = bw
    if (cardio) onSave({ sets, min: Math.max(1, Math.round(c.min) || 20), speed: Math.max(0, c.speed || 8) })
    else if (mode === 'time') onSave({ sets, mode: 'time', sec: Math.max(1, Math.round(c.sec) || 45), weight: Math.max(0, c.weight || 0), ...flags, ...prog })
    else {
      // A unilateral target is stored even: the split has to divide, and a typed 15 would
      // otherwise plan seven reps on one side and eight on the other, every session.
      const typed = Math.max(1, Math.round(c.reps) || 10)
      const reps = perSide ? Math.ceil(typed / 2) * 2 : typed
      const out = { sets, mode: 'reps', reps, weight: Math.max(0, c.weight || 0), ...flags, ...(perSide ? { side: true } : {}), ...prog }
      if (policyFor({ ...c, id: ex.id }, routine, 'reps') === 'double') out.repsMin = Math.min(reps, Math.max(1, Math.round(c.repsMin) || Math.max(1, reps - 2)))
      // A ceiling below the working reps would tell you to add a set on day one.
      if (bw && !(out.weight > 0) && c.repsMax > 0) out.repsMax = Math.max(reps, Math.round(c.repsMax))
      onSave(out)
    }
  }
  return <>
    <h3 className={H3 + ' capitalize'}>{ex.n}</h3>
    <Media ex={ex} />
    <div className="flex items-center gap-1.5 flex-wrap mt-2.5 mb-3.5">
      {cardio && <span className={TAG_ACC}><Icon name="figureRun" />{t('Cardio')}</span>}
      <span className={TAG}>{t(ex.tg || ex.bp)}</span><span className={TAG}>{t(ex.eq)}</span>
    </div>
    {ex.desc && <div className="bg-surface rounded-xl px-[15px] py-[13px] leading-[1.45] whitespace-pre-wrap text-[15px] mb-2.5 text-label-2">{ex.desc}</div>}
    {!cardio && <div className="mb-3.5">
      <Segmented className="seg-range mb-2.5" value={mode} onChange={setMode}
        options={[{ value: 'reps', label: t('Reps') }, { value: 'time', label: t('Time') }]} />
    </div>}
    <div className={'flex gap-2 [&>div]:flex-1 [&>div]:min-w-0 ' + (mode === 'time' ? 'mb-2' : 'mb-[18px]')}>
      {cardio ? <>
        <Stepper label={t('Intervals')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} className="[&>button]:w-[30px]" />
        <Stepper label={t('Minutes')} value={c.min} step={1} decimal={false} onChange={v => setC(x => ({ ...x, min: v }))} className="[&>button]:w-[30px]" />
        <Stepper label={t('Speed (km/h)')} value={c.speed} step={0.5} onChange={v => setC(x => ({ ...x, speed: v }))} className="[&>button]:w-[30px]" />
      </> : mode === 'time' ? <>
        <Stepper label={t('Sets')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} className="[&>button]:w-[30px]" />
        <Stepper label={t('Seconds')} value={c.sec} step={5} decimal={false} onChange={v => setC(x => ({ ...x, sec: v }))} className="[&>button]:w-[30px]" />
        <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} className="[&>button]:w-[30px]" />
      </> : <>
        <Stepper label={t('Sets')} value={c.sets} step={1} decimal={false} onChange={v => setC(x => ({ ...x, sets: v }))} className="[&>button]:w-[30px]" />
        <Stepper label={t('Reps')} value={c.reps} step={perSide ? 2 : 1} decimal={false} onChange={v => setC(x => ({ ...x, reps: v }))} className="[&>button]:w-[30px]" />
        {/* On bodyweight work the weight stepper is the click #32 is about, so it is not here
            until there is a belt to describe — see the added-weight row below. */}
        {!bw && <Stepper label={t('Weight ({0})', st.unit)} value={c.weight} step={2.5} onChange={v => setC(x => ({ ...x, weight: v }))} className="[&>button]:w-[30px]" />}
      </>}
    </div>
    {mode === 'time' && !bw && <div className={DIM_S + ' mb-[18px]'}>
      {t('A timer runs while you hold the set. Leave the weight at 0 for bodyweight holds.')}
    </div>}
    {/* ---------- bodyweight + per side (issues #31/#32/#33) ---------- */}
    {!cardio && <div className="bg-surface rounded-[14px] overflow-hidden mb-2">
      <Row icon="figureStrength" iconTint="var(--acc)" title={t('Bodyweight')}
        subtitle={bw ? t('No weight to enter — just log the reps.') : t('Ask for a weight on every set.')}>
        <Switch checked={bw} onChange={v => setC(x => ({ ...x, bodyweight: v, weight: v ? 0 : x.weight }))} />
      </Row>
      {mode === 'reps' && <Row icon="shuffle" iconTint="var(--blue)" title={t('Reps per side')}
        subtitle={perSide ? t('You still log the total: {0} is {1} per side.', c.reps || 0, fmtNum(sideReps(c.reps))) : t('For lunges, single-arm rows and the like.')}>
        {/* Turning it on rounds the target up to an even number, since half of an odd
            total is a rep one side does not get. */}
        <Switch checked={perSide} onChange={v => setC(x => ({ ...x, side: v || undefined, reps: v ? Math.ceil((x.reps || 0) / 2) * 2 : x.reps }))} />
      </Row>}
    </div>}
    {/* A stepper is too wide to sit in a list row next to a label — it squeezes the text to
        one word per line — so added weight gets the same full-width treatment as sets and
        reps, with its explanation underneath. */}
    {bw && <>
      <div className="flex gap-2 [&>div]:flex-1 [&>div]:min-w-0 mb-2">
        <Stepper label={t('Added ({0})', st.unit)} value={c.weight || 0} step={2.5}
          onChange={v => setC(x => ({ ...x, weight: v }))} className="[&>button]:w-[30px]" />
      </div>
      <div className={DIM_S + ' mb-[18px]'}>
        {t('For dips or pull-ups with a belt. Progression then follows the weight.')}
      </div>
    </>}
    {/* The rep ceiling only means something when there is no load to add instead. */}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className="flex gap-2 [&>div]:flex-1 [&>div]:min-w-0 mb-[18px]">
      <Stepper label={t('Top of the range')} value={c.repsMax || 0} step={1} decimal={false}
        onChange={v => setC(x => ({ ...x, repsMax: v }))} className="[&>button]:w-[30px]" />
    </div>}
    {mode === 'reps' && bw && !(c.weight > 0) && <div className={DIM_S + ' -mt-2.5 mb-[18px]'}>
      {c.repsMax > 0
        ? t('Reps climb to {0}, then a set is added and the reps start over. At {1} sets it asks you to add weight instead.', c.repsMax, MAX_BW_SETS)
        : t('Reps climb by one whenever every set was clean. Set a ceiling to add sets instead of reps forever.')}
    </div>}
    <ProgressionFields ex={ex} mode={mode} c={c} setC={setC} routine={routine} unit={st.unit} />
    <Button variant="primary" onClick={save}>{existing ? t('Save') : t('Add to routine')}</Button>
    {ex.custom && <><div className="h-2" /><Button icon="pencil" onClick={() => { close(); customExSheet(ex) }}>{t('Edit or delete this exercise')}</Button></>}
    {onDelete && <><div className="h-2" /><Button variant="danger" onClick={() => { close(); onDelete() }}>{t('Remove from routine')}</Button></>}
  </>
}
export const exConfigSheet = (ex, existing, onSave, onDelete, routine) => ui().openSheet(close => <ExConfig ex={ex} existing={existing} onSave={onSave} onDelete={onDelete} routine={routine} close={close} />)

/* ============================ glyph picker ============================ */
// Grouped by what the glyph means for a training day, so picking one is a scan
// of four short rows rather than a hunt through twenty loose icons.
export const glyphPicker = (current, onPick) => {
  const cur = glyphOf(current)
  return ui().openSheet(close => <>
    <h3 className={H3}>{t('Pick an icon')}</h3>
    {GLYPH_GROUPS.map(g => (
      <div key={g.key} className="mb-3.5">
        <div className="text-[13px] font-normal text-label-2 tracking-[-.004em] px-0.5 pb-[7px]">{t(g.key)}</div>
        <div className="grid grid-cols-5 gap-[9px]">
          {g.items.map(n => (
            <button key={n} aria-label={n}
              className={'aspect-square rounded-[13px] bg-surface flex items-center justify-center text-[24px] text-label no-tap transition-[background-color,color,transform] duration-150 active:scale-90 ' + (n === cur ? 'bg-acc! text-on-acc!' : '')}
              onClick={() => { close(); onPick(n) }}>
              <Icon name={n} />
            </button>
          ))}
        </div>
      </div>
    ))}
    <div className="h-1" />
  </>)
}

/* ============================ share / print / import a plan ============================ */
export const planToolsSheet = () => ui().openSheet(close => <PlanTools close={close} />)

function PlanTools({ close }) {
  const st = useStore(s => s.S)
  const user = useStore(s => s.user)
  const fileRef = useRef(null)
  const hasRoutines = (st.routines || []).some(r => r.ex && r.ex.length)

  const exportFile = async () => {
    const bundle = buildPlanBundle(st, user?.name ? t('{0}’s plan', user.name) : '')
    const json = JSON.stringify(bundle, null, 2)
    const name = 'opengym-plan-' + todayISO() + '.json'
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    close(); toast(t('Plan file saved — send it to a friend'))
  }
  const pickFile = ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try { const bundle = parsePlan(rd.result); close(); planImportSheet(bundle) }
      catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }

  return <>
    <h3 className={H3}>{t('Share your plan')}</h3>
    <div className={MUTED_S + ' mb-4'}>{t('Send your routines to a friend, or put your week on paper.')}</div>
    <Button variant="primary" icon="upload" onClick={exportFile} disabled={!hasRoutines}>{t('Export plan file')}</Button>
    <div className={DIM_S + ' mx-0.5 mt-[7px] leading-[1.4]'}>{t('A small file a friend imports into their own openGym — routines only, none of your workouts or weigh-ins.')}</div>
    <div className="h-3" />
    <Button variant="tinted" icon="download" onClick={() => { close(); printPlan(st, user?.name || '') }} disabled={!hasRoutines}>{t('Print / Save as PDF')}</Button>
    <div className={DIM_S + ' mx-0.5 mt-[7px] leading-[1.4]'}>{t('A clean one-page-per-plan printout — no exercise ever splits across a page.')}</div>
    {!hasRoutines && <div className={DIM_S + ' mx-0.5 mt-3'}>{t('Add an exercise to a routine first — an empty plan has nothing to share.')}</div>}
    <h4 className={SEC}>{t('Got a plan from a friend?')}</h4>
    <Button variant="ghost" icon="folder" onClick={() => fileRef.current?.click()}>{t('Import a plan file')}</Button>
    <input ref={fileRef} type="file" accept="application/json,.json" onChange={pickFile} hidden />
  </>
}

export const planImportSheet = bundle => ui().openSheet(close => <PlanImport bundle={bundle} close={close} />)

function PlanImport({ bundle, close }) {
  const [schedule, setSchedule] = useState(false)
  const apply = () => {
    update(s => mergePlan(s, bundle, { schedule }))
    close()
    toast(t('Added {0} routines to your plan', bundle.routineCount))
    nav('/plan')
  }
  return <>
    <h3 className={H3}>{bundle.name ? t('Import “{0}”', bundle.name) : t('Import this plan')}</h3>
    <div className={MUTED_S + ' mb-3.5'}>
      {t(bundle.routineCount === 1 ? '{0} routine' : '{0} routines', bundle.routineCount)}
      {' · ' + exCount(bundle.exerciseCount)}
      {bundle.scheduledDays > 0
        ? ' · ' + t(bundle.scheduledDays === 1 ? 'scheduled on {0} day' : 'scheduled on {0} days', bundle.scheduledDays)
        : ''}
    </div>
    <div className={DIM_S + ' mb-3.5 leading-[1.4]'}>{t('These are added as new routines — nothing you already have is changed.')}</div>
    {bundle.dropped > 0 && <div className="text-[13px] leading-[1.38] text-yellow mb-3.5 leading-[1.4]">
      {t(bundle.dropped === 1
        ? '{0} exercise in the file isn’t in your library and was left out.'
        : '{0} exercises in the file aren’t in your library and were left out.', bundle.dropped)}
    </div>}
    {bundle.scheduledDays > 0 && <div className="flex items-center justify-between py-2.5 px-0.5 border-y border-sep mb-4 gap-3">
      <div><div className={TT} style={{ fontSize: 15 }}>{t('Use this weekly schedule')}</div><div className={DIM_S}>{t('Replaces your current Mon–Sun assignments.')}</div></div>
      <Switch checked={schedule} onChange={setSchedule} />
    </div>}
    <Button variant="primary" onClick={apply}>{t('Add to my plan')}</Button>
    <div className="h-2" />
    <Button variant="ghost" className="text-label-3!" onClick={close}>{t('Cancel')}</Button>
  </>
}

/* ============================ day override / assign ============================ */
function DayOverride({ iso, close }) {
  const st = useStore(s => s.S)
  const wd = new Date(iso + 'T12:00:00').getDay()
  const weeklyR = st.routines.find(r => r.id === st.week[wd])
  const hasOvr = st.dayPlan[iso] !== undefined
  const effId = effectiveRoutineId(st, iso)
  const set = v => {
    update(s => { if (!v) delete s.dayPlan[iso]; else s.dayPlan[iso] = v })
    close()
    toast(v === '' ? t('Back to weekly plan') : v === 'rest' ? t('{0} set to rest', fmtDate(iso)) : t('{0} planned for {1}', (st.routines.find(r => r.id === v) || {}).name, fmtDate(iso)))
  }
  return <>
    <h3 className={H3}>{fmtDate(iso, true)}</h3>
    <div className={MUTED_S + ' mb-3'}>{t('Weekly plan:')} {weeklyR ? weeklyR.name : t('Rest')}{hasOvr && <span className="text-orange"> · {t('changed for this day')}</span>}<br />{t('Sick, missed a day or want a different session? Pick what to train instead.')}</div>
    <div className="flex flex-col gap-2">
      {st.routines.map(r => <div key={r.id} className={ITEM} onClick={() => set(r.id)}>
        <span className={LROW_I}><Icon name={glyphOf(r.emoji)} /></span>
        <div className="flex-1 min-w-0"><div className={TT}>{r.name}</div><div className={SS}>{exCount(r.ex.length)}</div></div>
        {effId === r.id && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}
      </div>)}
      <div className={ITEM} onClick={() => set('rest')}><span className={LROW_I + ' bg-surface-3!'}><Icon name="moon" /></span><div className="flex-1 min-w-0"><div className={TT}>{t('Rest / skip this day')}</div></div>{effId === null && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}</div>
      {hasOvr && <div className={ITEM} onClick={() => set('')}><span className={LROW_I + ' bg-surface-3!'}><Icon name="reset" /></span><div className="flex-1 min-w-0"><div className={TT}>{t('Back to weekly plan')}</div></div></div>}
    </div>
  </>
}
export const dayOverrideSheet = iso => ui().openSheet(close => <DayOverride iso={iso} close={close} />)

function DayAssign({ day, close }) {
  const st = useStore(s => s.S)
  const set = v => { update(s => { if (v) s.week[day] = v; else delete s.week[day] }); close() }
  return <>
    <h3 className={H3}>{t(DAYN[day])}</h3>
    <div className="flex flex-col gap-2">
      <div className={ITEM} onClick={() => set('')}><span className={LROW_I + ' bg-surface-3!'}><Icon name="moon" /></span><div className="flex-1 min-w-0"><div className={TT}>{t('Rest day')}</div></div>{!st.week[day] && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}</div>
      {st.routines.map(r => <div key={r.id} className={ITEM} onClick={() => set(r.id)}>
        <span className={LROW_I}><Icon name={glyphOf(r.emoji)} /></span>
        <div className="flex-1 min-w-0"><div className={TT}>{r.name}</div><div className={SS}>{exCount(r.ex.length)}</div></div>
        {st.week[day] === r.id && <Icon name="check" className="text-acc text-[17px] shrink-0 [--icon-stroke:2.4]" />}
      </div>)}
    </div>
  </>
}
export const dayAssignSheet = day => ui().openSheet(close => <DayAssign day={day} close={close} />)

/* ============================ workout detail ============================ */
function WorkoutDetail({ w, close }) {
  const st = useStore(s => s.S)
  return <>
    <h3 className={H3}>{w.name}</h3>
    <div className={MUTED_S + ' mb-3'}>{[fmtDate(w.d, true), ...durPart(w.end - w.start), fmtVol(w.vol, st.unit), ...(w.bw ? [fmtNum(w.bw) + ' ' + st.unit] : [])].join(' · ')}</div>
    {w.entries.map((e, i) => {
      const ex = EXIDX[e.id]
      return <div key={i} className="flex items-start gap-3 mb-3">
        {ex && <Thumb ex={ex} />}
        <div className="flex-1 min-w-0"><div className={TT + ' capitalize font-semibold'}>{ex ? ex.n : (e.n || e.id)} {w.prs && w.prs.includes(e.id) && <span className="inline-flex items-center gap-1 bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)] text-yellow rounded-md px-2 py-[3px] text-[12px] font-medium"><Icon name="trophy" className="text-[13px]" />PR</span>}</div>
          <div className={SS}>{e.sets.filter(s => s.done).map(s => setLabel(e.id, s, e.target)).join('  ·  ') || t('no sets')}</div></div>
      </div>
    })}
    <Button variant="danger" onClick={() => confirmSheet({ title: t('Delete workout?'), message: t('This removes it from your history for good.'), confirmText: t('Delete'), danger: true, onConfirm: () => { update(s => { s.workouts = s.workouts.filter(x => x.id !== w.id) }); close(); toast(t('Workout deleted')) } })}>{t('Delete workout')}</Button>
  </>
}
export const workoutDetailSheet = w => ui().openSheet(close => <WorkoutDetail w={w} close={close} />)

/* ============================ calendar ============================ */
function Calendar({ start, close }) {
  const st = useStore(s => s.S)
  const [cur, setCur] = useState(() => { const d = start ? new Date(start) : new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const byDay = {}
  st.workouts.forEach(w => (byDay[w.d] = byDay[w.d] || []).push(w))
  const startOffset = (new Date(y, mo, 1).getDay() + 6) % 7
  const daysIn = new Date(y, mo + 1, 0).getDate()
  const monthWs = st.workouts.filter(w => w.d.startsWith(y + '-' + String(mo + 1).padStart(2, '0')))
  const monthVol = monthWs.reduce((a, w) => a + (w.vol || 0), 0)
  const monthMs = monthWs.reduce((a, w) => a + Math.max(0, (w.end || w.start) - w.start), 0)
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(<div key={'e' + i} />)
  for (let d = 1; d <= daysIn; d++) {
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ws = byDay[iso], effId = effectiveRoutineId(st, iso), ovr = st.dayPlan[iso] !== undefined
    const dotCls = ws ? 'bg-acc' : ovr && effId ? 'bg-orange' : effId ? 'bg-label-3' : 'bg-transparent'
    cells.push(<button key={d} onClick={() => {
      if (!ws) { close(); dayOverrideSheet(iso); return }
      if (ws.length === 1) { close(); workoutDetailSheet(ws[0]); return }
      close(); ui().openSheet(c2 => <><h3 className={H3}>{fmtDate(iso, true)}</h3><div className="flex flex-col gap-2">{ws.map(w => <WorkoutRow key={w.id} w={w} onClick={() => { c2(); workoutDetailSheet(w) }} />)}</div></>)
    }}
      className={'aspect-square rounded-[10px] flex flex-col items-center justify-center gap-[3px] font-normal text-[15px] text-label no-tap transition-colors duration-150 active:bg-surface-2 ' +
        (ws ? 'bg-acc-soft text-acc' : 'bg-surface') +
        (iso === todayISO() ? ' shadow-[inset_0_0_0_1.8px_var(--acc)]' : '')}>
      <span>{d}</span><i className={'w-[5px] h-[5px] rounded-full ' + dotCls} />
    </button>)
  }
  return <>
    <div className="flex items-center justify-between mb-0.5">
      <button className={ICONBTN + ' w-9 h-9 text-[18px]'} onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
      <h3 className={H3 + ' m-0'}>{t(MONTHS_LONG[mo])} {y}</h3>
      <button className={ICONBTN + ' w-9 h-9 text-[18px]'} onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
    </div>
    <div className={MUTED_S + ' text-center'}>{monthWs.length ? `${t(monthWs.length === 1 ? '{0} workout' : '{0} workouts', monthWs.length)} · ${fmtDur(monthMs)} · ${fmtVol(monthVol, st.unit)}` : t('No workouts this month')}</div>
    <div className="grid grid-cols-7 gap-[5px] mt-2.5">
      {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(l => <div key={l} className="text-center text-[11px] text-label-3 font-medium uppercase py-0.5">{t(l)}</div>)}
      {cells}
    </div>
    <div className="flex gap-3.5 justify-center mt-3 text-[12px] text-label-3">
      <span className="flex items-center"><i className="inline-block w-1.5 h-1.5 rounded-full mr-[5px] bg-acc" />{t('Trained')}</span>
      <span className="flex items-center"><i className="inline-block w-1.5 h-1.5 rounded-full mr-[5px] bg-label-3" />{t('Planned')}</span>
      <span className="flex items-center"><i className="inline-block w-1.5 h-1.5 rounded-full mr-[5px] bg-orange" />{t('Rescheduled')}</span>
    </div>
    <div className={DIM_S + ' text-center mt-2.5'}>{t('Tap a trained day for details · tap any other day to plan a session')}</div>
  </>
}
export const calendarSheet = start => ui().openSheet(close => <Calendar start={start} close={close} />)

/* shared small workout row (used in lists) */
export function WorkoutRow({ w, onClick }) {
  const st = useStore(s => s.S)
  const glyph = glyphOf((st.routines.find(r => r.id === w.routineId) || {}).emoji)
  return <div className={ITEM} onClick={onClick}>
    <span className={LROW_I} style={{ width: 34, height: 34, borderRadius: 8, fontSize: 19 }}><Icon name={glyph} /></span>
    <div className="flex-1 min-w-0"><div className={TT}>{w.name}</div>
      <div className={SS}>{[fmtDate(w.d, true), ...durPart(w.end - w.start), t('{0} sets', setsDone(w)), fmtVol(w.vol, st.unit)].join(' · ')}</div></div>
    {w.prs && w.prs.length > 0 && <span className="inline-flex items-center gap-1 bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)] text-yellow rounded-md px-2 py-[3px] text-[12px] font-medium shrink-0"><Icon name="trophy" className="text-[13px]" />{w.prs.length} PR</span>}
    <Icon name="chevronRight" className={CHEV} />
  </div>
}

/* ============================ workout lifecycle ============================ */
export function startFlow(routineId) {
  bwSheet({ required: true, onDone: bw => beginWorkout(routineId, bw) })
}
export function beginWorkout(routineId, bw) {
  const st = S()
  const r = routineId ? st.routines.find(x => x.id === routineId) : null
  // The prescription is applied as the session is built, so you walk up to the bar with the
  // right weight already on the screen instead of being told about it afterwards. `plan` is
  // kept on the entry purely so the workout can explain the number it chose.
  const entries = (r ? r.ex : []).map(cfg => {
    const plan = nextPrescription(st, cfg, r)
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets: applyPrescription(buildSets(st, cfg), plan) }
  })
  update(s => {
    s.active = { id: uid(), d: todayISO(), start: Date.now(), routineId, name: r ? r.name : t('Freestyle'), bw: bw || null, cur: 0, entries }
  })
  useUI.getState().stopRest()
  nav('/workout')
}
function TopWeight({ entryIdx, close }) {
  const st = useStore(s => s.S)
  const A = st.active
  // The workout can end underneath this sheet: finishing from the last exercise clears
  // `active`, and this re-renders before the sheet is torn down. Everything below is
  // read defensively and the sheet dismisses itself — reading A.entries straight took
  // the whole app down with it. Hooks still run unconditionally, so the bail-out has
  // to sit after every one of them.
  const entry = A ? A.entries[entryIdx] : null
  const ex = entry && EXIDX[entry.id]
  const maxSet = entry ? Math.max(0, ...entry.sets.filter(s => s.done).map(s => s.w || 0)) : 0
  const prevBest = entry ? Math.max((st.exWeights[entry.id] || {}).w || 0, bestWeightFor(st, entry.id)) : 0
  const [v, setV] = useState(entry ? (Math.max(maxSet, prevBest) || entry.target.weight || 0) : 0)
  useEffect(() => { if (!entry) close() }, [!entry])

  const units = supersetUnits(A ? A.entries : [])
  const unit = entry ? unitOf(units, entryIdx) : []
  const unitDone = !!entry && unit.every(i => A.entries[i].sets.every(s => s.done))
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx === units.length - 1
  if (!entry || !ex) return null

  const commit = advance => {
    const n = Math.round((v || 0) * 10) / 10
    if (!isFinite(n) || n < 0) { toast(t('Enter a valid weight')); return }
    update(s => {
      s.active.entries[entryIdx].topW = n
      const cur = s.exWeights[entry.id]
      s.exWeights[entry.id] = { w: Math.max(n, cur ? cur.w : 0), d: todayISO() }
    })
    close()
    if (advance && unitDone) {
      if (isLastUnit) workoutCompleteSheet()               // whole workout done → finish/continue prompt
      else update(s => { s.active.cur = units[unitIdx + 1][0] })
    } else toast(t('Tracked — next time starts at {0}', fmtNum(S().exWeights[entry.id].w) + ' ' + st.unit))
  }
  return <>
    <h3 className={H3 + ' capitalize flex items-center gap-2'}><Icon name="checkCircle" className="text-acc" />{t('{0} done', ex.n)}</h3>
    <div className={MUTED_S}>{t('Confirm the weight you worked with — your highest becomes the default next time.')}{!unitDone && unit.length > 1 ? ' ' + t('Then finish the superset partner.') : ''}</div>
    <WeightInput value={v} setValue={setV} unit={st.unit} />
    <div className="h-2.5" />
    {prevBest > 0 ? <div className={DIM_S + ' text-center mb-3'}>{t('Previous best:')} {fmtNum(prevBest)} {st.unit}{maxSet > prevBest && <span className="text-yellow"> — {t('new record!')}</span>}</div> : <div className="h-1" />}
    {unitDone ? <>
      <Button variant="primary" trailingIcon={isLastUnit ? null : 'chevronRight'} onClick={() => commit(true)}>{isLastUnit ? t('Save') : t('Save & next exercise')}</Button>
      <div className="h-2" /><Button variant="ghost" className="text-label-3!" onClick={() => commit(false)}>{t('Just close')}</Button>
    </> : <Button variant="primary" onClick={() => commit(false)}>{t('Save weight')}</Button>}
  </>
}
export const topWeightSheet = entryIdx => ui().openSheet(close => <TopWeight entryIdx={entryIdx} close={close} />)

// Shown when the last exercise's last set is checked — finish, or keep going.
function WorkoutComplete({ close }) {
  return <div className="text-center py-2">
    <div className="text-[44px] flex justify-center text-acc"><Icon name="checkCircle" /></div>
    <h3 className={H3 + ' my-2'}>{t("That's the whole workout!")}</h3>
    <div className={MUTED_S + ' mb-4'}>{t('Every exercise done — great work. Finish up, or keep going and add another exercise.')}</div>
    <Button variant="primary" icon="flag" onClick={() => { close(); finishWorkout() }}>{t('Finish workout')}</Button>
    <div className="h-2" />
    <Button onClick={() => { close(); useUI.getState().toast(t('Keep going — tap “+ Add exercise” below')) }}>{t('Continue workout')}</Button>
  </div>
}
export const workoutCompleteSheet = () => ui().openSheet(close => <WorkoutComplete close={close} />, { kind: 'center' })

function FinishSummary({ w, prs, e1prs = [], close }) {
  const st = useStore(s => s.S)
  return <div className="text-center py-2">
    <div className="text-[44px] flex justify-center text-acc"><Icon name="trophy" /></div>
    <h3 className={H3 + ' my-2'}>{t('Workout complete!')}</h3>
    <div className="grid grid-cols-2 gap-2.5 mb-3 text-left">
      <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Duration')}</div><div className={TILE_V + ' text-[17.6px]'}>{fmtDur(w.end - w.start)}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Volume')}</div><div className={TILE_V + ' text-[17.6px]'}>{fmtVol(w.vol, st.unit)}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('Sets')}</div><div className={TILE_V + ' text-[17.6px]'}>{setsDone(w)}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className={TILE_L}>{t('PRs')}</div><div className={TILE_V + ' text-[20px]'}>{prs.length || '—'}</div></div>
    </div>
    {(prs.length > 0 || e1prs.length > 0) && <div className="text-left mb-3">
      {prs.map(id => <div key={id} className="flex items-center gap-[5px] text-[13px] leading-[1.38] text-acc capitalize"><Icon name="trophy" className="text-[13px]" />{t('New PR:')} {(EXIDX[id] || {}).n || id}</div>)}
      {e1prs.map(p => <div key={p.id} className="flex items-center gap-[5px] text-[13px] leading-[1.38] text-acc capitalize"><Icon name="chartLine" className="text-[13px]" />{t('Best estimated 1RM:')} {(EXIDX[p.id] || {}).n || p.id} · {fmtNum(p.est)} {st.unit}</div>)}
    </div>}
    <h4 className={SEC + ' text-left!'}>{t('What you just trained')}</h4>
    <BodyMap load={loadOfWorkouts([w])} body={st.body} />
    <div className="h-3.5" />
    <Button variant="primary" onClick={() => { close(); nav('/home') }}>{t('Nice!')}</Button>
  </div>
}
export function finishWorkout() {
  const A = S().active
  if (!A) return
  const done = setsDoneActive(A)
  const total = A.entries.reduce((n, e) => n + e.sets.length, 0)
  if (!done) { confirmSheet({ title: t('Nothing logged yet'), message: t('You haven’t checked off any sets. Finish the workout anyway?'), confirmText: t('Finish anyway'), onConfirm: doFinishWorkout }); return }
  if (done < total) { confirmSheet({ title: t('Finish early?'), message: t(total - done === 1 ? '{0} set still unchecked. Finish the workout now?' : '{0} sets still unchecked. Finish the workout now?', total - done), confirmText: t('Finish workout'), onConfirm: doFinishWorkout }); return }
  doFinishWorkout()
}
function doFinishWorkout() {
  const st = S()
  const A = st.active
  if (!A) return
  const prs = []
  const e1prs = []
  A.entries.forEach(e => {
    const mx = Math.max(0, ...e.sets.filter(s => s.done).map(s => s.w))
    if (mx > 0 && mx > bestWeightFor(st, e.id)) prs.push(e.id)
    // A heavier estimate without a heavier top set is its own kind of progress —
    // same weight for more reps. Reported separately so it can't be read as a load PR.
    const rec = is1RMRecord(st, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  })
  const w = {
    id: A.id, d: A.d, start: A.start, end: Date.now(), routineId: A.routineId, name: A.name, bw: A.bw,
    // `target` (what the session prescribed) is kept alongside the sets: without it a
    // finished workout cannot say whether it hit its reps, and a timed session reads back
    // as "0 reps". It is what the progression engine works from.
    entries: A.entries.map(e => ({ id: e.id, sets: e.sets, topW: e.topW || null, target: e.target || null })).filter(e => e.sets.some(s => s.done)),
    prs
  }
  w.vol = workoutVolume(w)
  update(s => {
    w.entries.forEach(e => {
      const mx = Math.max(0, ...e.sets.filter(x => x.done).map(x => x.w || 0), e.topW || 0)
      if (mx > 0) { const cur = s.exWeights[e.id]; if (!cur || mx > cur.w) s.exWeights[e.id] = { w: mx, d: w.d } }
    })
    s.workouts.push(w)
    s.active = null
  })
  useUI.getState().stopRest()
  beep(snd(), 880, 0.15); beep(snd(), 1100, 0.15, 0.18); beep(snd(), 1320, 0.3, 0.36)
  syncWorkoutLog(w)   // server is the source of truth for history — queue + POST, offline-safe
  ui().openSheet(close => <FinishSummary w={w} prs={prs} e1prs={e1prs} close={close} />, { kind: 'center', locked: true })
}

// Finished sessions go to the relational WorkoutLog table (analytics, cross-device history).
// Idempotent by client UUID; if the network is down the log waits in localStorage and flushes
// on next boot/visibility. The local S.workouts copy still updates instantly either way.
export { syncWorkoutLog, flushWorkoutQueue } from './lib/wlog.js'

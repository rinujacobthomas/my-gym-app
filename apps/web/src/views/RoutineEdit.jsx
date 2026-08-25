import { useNavigate, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { exOr } from '../lib/exercises.js'
import { uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { supersetUnits, cleanupSg, exLine } from '../lib/history.js'
import { Thumb } from '../components/Media.jsx'
import { glyphPicker, exercisePicker, exConfigSheet, confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { Button, SelectRow } from '../components/ui.jsx'
import { POLICIES_FOR, POLICY_NAME, POLICY_DESC } from '../lib/progression.js'
import BodyMap from '../components/BodyMap.jsx'
import { loadOfRoutine, rankOf, MUSCLE_NAME } from '../lib/muscles.js'

export default function RoutineEdit() {
  const nav = useNavigate()
  const { id } = useParams()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const r = S.routines.find(x => x.id === id)
  useEffect(() => { if (!r) nav('/plan') }, [!!r])
  if (!r) return null

  const edit = fn => update(s => { fn(s.routines.find(x => x.id === id).ex) })
  const move = (i, dir) => edit(ex => { const j = i + dir; if (j < 0 || j >= ex.length) return;[ex[i], ex[j]] = [ex[j], ex[i]]; cleanupSg(ex) })
  const toggleLink = i => edit(ex => {
    if (i < 1) return
    const cur = ex[i], prev = ex[i - 1]
    if (cur.sg && prev.sg && cur.sg === prev.sg) delete cur.sg
    else { const gid = prev.sg || ('sg' + uid()); prev.sg = gid; cur.sg = gid }
    cleanupSg(ex)
  })

  const units = supersetUnits(r.ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  return <div className="max-w-[640px] mx-auto desk:max-w-[860px]">
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/plan')} aria-label={t('Plan')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 mx-3">
        <input className="w-full bg-surface rounded-xl px-[15px] py-[13px] text-[20px] font-semibold tracking-[-.021em] outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)]"
          defaultValue={r.name}
          onChange={e => update(s => { s.routines.find(x => x.id === id).name = e.target.value.trim() || t('Routine') })} />
      </div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" aria-label={t('Pick an icon')} onClick={() => glyphPicker(r.emoji, g => update(s => { s.routines.find(x => x.id === id).emoji = g }))}><Icon name={glyphOf(r.emoji)} /></button>
    </div>

    <div className="bg-surface rounded-[14px] overflow-hidden mb-4">
      <SelectRow icon="chartLine" title={t('Progression')} sheetTitle={t('Progression')}
        value={r.prog || 'linear'} onChange={v => update(s => { s.routines.find(x => x.id === id).prog = v })}
        options={POLICIES_FOR.reps.map(p => ({ value: p, label: t(POLICY_NAME[p]), subtitle: t(POLICY_DESC[p]) }))} />
    </div>
    <div className="text-label-3 text-[13px] leading-[1.38] -mt-2.5 mx-0.5 mb-4">
      {t('Applies to every exercise in this routine that does not set its own rule.')}
    </div>

    {r.ex.length ? <div className="flex flex-col gap-2 desk:grid desk:grid-cols-2">{r.ex.map((e, i) => {
      // An unresolvable id is shown rather than skipped — hiding it left an entry you
      // could neither see nor delete, but that still turned up in the workout.
      const ex = exOr(e.id)
      const linkedPrev = i > 0 && e.sg && r.ex[i - 1].sg === e.sg
      return <div key={i}>
        {unitFirst.has(i) && <div className="text-[12px] font-semibold tracking-[-.004em] text-acc mt-2 mb-[5px] ml-1 flex items-center gap-[5px]"><Icon name="link" className="text-[13px]" />{t('Superset')}</div>}
        <div className={'flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer ' + (inSS.has(i) ? 'shadow-[inset_3px_0_0_var(--acc)]' : '')} onClick={() => {
          exConfigSheet(ex, e, cfg => edit(x => { x[i] = { id: x[i].id, sg: x[i].sg, ...cfg } }), () => edit(x => { x.splice(i, 1); cleanupSg(x) }), r)
        }}>
          <Thumb ex={ex} />
          <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em] capitalize">{ex.n}</div><div className="text-label-2 text-[13px] mt-0.5">{exLine(e, S.unit)}</div></div>
          <div className="flex flex-col gap-0.5 shrink-0 items-center">
            {i > 0 && <button title={t('Superset with exercise above')} className={'w-8 h-7 rounded-lg shrink-0 text-[15px] flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap ' + (linkedPrev ? 'bg-acc-soft text-acc' : 'bg-surface text-label')} onClick={ev => { ev.stopPropagation(); toggleLink(i) }}><Icon name="link" /></button>}
            <div className="flex gap-0.5">
              <button aria-label="Move up" className="w-7 h-6 rounded-[7px] shrink-0 bg-surface text-label text-[12px] flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={ev => { ev.stopPropagation(); move(i, -1) }}><Icon name="chevronUp" /></button>
              <button aria-label="Move down" className="w-7 h-6 rounded-[7px] shrink-0 bg-surface text-label text-[12px] flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={ev => { ev.stopPropagation(); move(i, 1) }}><Icon name="chevronDown" /></button>
            </div>
          </div>
        </div>
      </div>
    })}</div> : <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]"><div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="dumbbell" /></div>{t('No exercises yet — add your first one.')}</div>}

    {/* Coverage of the routine as planned, so a gap shows up while you're building it
        rather than after a month of training around it. */}
    {r.ex.length > 0 && (() => {
      const load = loadOfRoutine(r)
      const { worked } = rankOf(load)
      return <div className="bg-surface rounded-[14px] p-4 mt-3 mb-3">
        <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 mb-3">{t('What this session hits')}</h2>
        <BodyMap load={load} body={S.body} />
        <div className="flex flex-wrap gap-1.5 mt-1">
          {worked.slice(0, 6).map(m => <span key={m} className="text-[12px] px-[9px] py-1 rounded-full bg-surface-2 text-label-2">{t(MUSCLE_NAME[m])}</span>)}
        </div>
      </div>
    })()}

    <div className="flex items-center gap-[5px] text-label-3 text-[13px] leading-[1.38] mx-0.5 my-2.5"><Icon name="link" className="text-[13px]" />{t('Tap the link button on an exercise to superset it with the one above — you’ll do them back-to-back.')}</div>
    <Button variant="primary" onClick={() => exercisePicker(ex => exConfigSheet(ex, null, cfg => edit(x => { x.push({ id: ex.id, ...cfg }) }), null, r))} icon="plus">{t('Add exercise')}</Button>
    <div className="h-2.5" />
    <Button variant="danger" onClick={() => confirmSheet({
      title: t('Delete routine?'), message: t('“{0}” and its exercises will be removed.', r.name), confirmText: t('Delete'), danger: true,
      onConfirm: () => {
        update(s => {
          s.routines = s.routines.filter(x => x.id !== id)
          Object.keys(s.week).forEach(k => { if (s.week[k] === id) delete s.week[k] })
          Object.keys(s.dayPlan).forEach(k => { if (s.dayPlan[k] === id) delete s.dayPlan[k] })
        })
        nav('/plan')
      }
    })}>{t('Delete routine')}</Button>
  </div>
}

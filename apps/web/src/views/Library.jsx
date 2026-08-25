import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXDB, BODYPARTS, allExercises, equipmentOf } from '../lib/exercises.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Thumb } from '../components/Media.jsx'
import { exerciseDetailSheet, addToRoutineSheet, customExSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// confirm-style sheet without a cancel branch — the lock is informational
const lockedSheet = name => {
  const { openSheet } = useUI.getState()
  openSheet(close =>
    <div className="text-center py-1">
      <h3 className="text-[20px] font-semibold tracking-[-.021em] mb-2">{t('Locked')}</h3>
      <div className="text-label-2 mb-[18px] leading-[1.5]">{t('Ask your trainer to unlock {0}', name)}</div>
      <Button variant="primary" onClick={close}>{t('OK')}</Button>
      <div className="h-2" />
    </div>
  , { kind: 'center' })
}

export default function Library() {
  const S = useStore(s => s.S)
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState('')
  const [shown, setShown] = useState(40)
  const premQ = useQuery({ queryKey: qk.premiumExercises, queryFn: () => api('/api/exercises/premium') })
  const unlQ = useQuery({ queryKey: qk.unlocks(), queryFn: () => api('/api/exercises/unlocks') })
  // null until the server answers — nothing renders as locked on a maybe
  const premiumIds = premQ.data ? new Set(premQ.data.premiumIds || []) : null
  const unl = unlQ.data || {}
  const unlockedEx = new Set(unl.exerciseIds || [])
  const unlockedBp = new Set(unl.bodyparts || [])
  const experienced = !!unl.experienced
  const customIds = new Set((S.customEx || []).map(c => c.id))
  const isLocked = e => !!premiumIds && !customIds.has(e.id) &&
    !unlockedEx.has(e.id) && !unlockedBp.has(e.bp) && !experienced

  const ql = q.toLowerCase().trim()
  const base = allExercises(S).filter(e => (!bp || e.bp === bp) && (!ql || e.n.toLowerCase().includes(ql) || e.tg.includes(ql) || e.eq.includes(ql) || (e.desc || '').toLowerCase().includes(ql)))
  const eqOpts = equipmentOf(base)
  // Drop the equipment filter if the search narrowed it away, so you never hit a dead end.
  const eqOn = eqOpts.includes(eq) ? eq : ''
  const f = eqOn ? base.filter(e => e.eq === eqOn) : base

  return <>
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <div><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Exercises')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('{0} exercises with animations', EXDB.length)}</div></div>
    </div>
    <div className="relative flex items-center mb-2.5">
      <svg viewBox="0 0 24 24" className="absolute left-[11px] top-1/2 -translate-y-1/2 z-[1] w-4 h-4 stroke-label-3 fill-none [stroke-width:2.1] [stroke-linecap:round]"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input className="w-full bg-surface-2 rounded-[10px] pl-[35px] pr-[15px] py-[13px] text-[17px] tracking-[-.012em] outline-none border-0 placeholder:text-label-3 focus:shadow-[inset_0_0_0_2px_var(--acc)]" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} />
    </div>
    <div className="flex gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
      <button className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] tracking-[-.006em] transition-colors duration-150 no-tap ' + (!bp ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setBp(''); setEq(''); setShown(40) }}>{t('All')}</button>
      {BODYPARTS.map(b => <button key={b} className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] capitalize transition-colors duration-150 no-tap ' + (bp === b ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setBp(b); setEq(''); setShown(40) }}>{t(b)}</button>)}
    </div>
    {eqOpts.length > 1 && <div className="flex gap-[7px] overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-3">
      <button className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] transition-colors duration-150 no-tap ' + (!eqOn ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setEq(''); setShown(40) }}>{t('Any equipment')}</button>
      {eqOpts.map(x => <button key={x} className={'shrink-0 px-[13px] py-1.5 rounded-full text-[14px] capitalize transition-colors duration-150 no-tap ' + (eqOn === x ? 'bg-acc text-on-acc font-medium' : 'bg-surface text-label font-normal active:bg-surface-2')} onClick={() => { setEq(x); setShown(40) }}>{t(x)}</button>)}
    </div>}
    <div className="flex flex-col gap-2 desk:grid desk:grid-cols-2 desk:gap-2 min-[1400px]:grid-cols-3">
      <div className="flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer" onClick={() => customExSheet(null, ex => exerciseDetailSheet(ex), q.trim())}>
        <div className="w-[50px] h-[50px] rounded-[9px] shrink-0 flex items-center justify-center text-[21px] bg-surface-2 text-label-2"><Icon name="sparkles" /></div>
        <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em]">{t('Create your own exercise')}</div><div className="text-label-2 text-[13px] mt-0.5">{t('name + body part, no animation')}</div></div><Icon name="plus" className="text-label shrink-0 text-[15px] [--icon-stroke:2.4]" />
      </div>
      {f.slice(0, shown).map(e => {
        const best = bestWeightFor(S, e.id)
        const locked = isLocked(e)
        return <div key={e.id}
          className={'relative flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer' + (locked ? ' opacity-60' : '')}
          onClick={() => locked ? lockedSheet(e.n) : exerciseDetailSheet(e)}>
          <Thumb ex={e} />
          <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em] capitalize">{e.n}</div><div className="text-label-2 text-[13px] mt-0.5 capitalize">{t(e.tg || e.bp)} · {t(e.eq)}</div></div>
          {best > 0 && <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0">{fmtNum(best)}</span>}
          {locked
            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 bg-surface-2 text-label-2"><Icon name="lock" className="text-[13px]" /></span>
            : <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>}
        </div>
      })}
      {f.length === 0 && <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]"><div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>
    {f.length > shown && <><div className="h-2.5" /><Button onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
  </>
}

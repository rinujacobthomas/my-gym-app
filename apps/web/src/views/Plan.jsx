import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, uid, exCount } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dayAssignSheet, loadStarterPlan, planToolsSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  return <>
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <div><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Plan')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Your weekly routine')}</div></div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    <div className="desk:grid desk:grid-cols-2 desk:gap-3.5 desk:items-start [&>*]:desk:min-w-0">
      <div>
        <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1">{t('Week schedule')}</h4>
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map(d => {
            const r = S.routines.find(x => x.id === S.week[d])
            return <div key={d} className="flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer" onClick={() => dayAssignSheet(d)}>
              <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em]">{t(DAYN[d])}</div></div>
              {r ? <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize shrink-0"><Icon name={glyphOf(r.emoji)} />{r.name}</span> : <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize shrink-0">{t('Rest')}</span>}
              <Icon name="chevronRight" className="text-label shrink-0 text-[15px] [--icon-stroke:2.4]" /></div>
          })}
        </div>
      </div><div>
        <div className="flex items-center justify-between mt-[22px] mb-2.5">
          <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 px-1">{t('Routines')}</h4>
          <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
        </div>
        {S.routines.length ? <div className="flex flex-col gap-2">{S.routines.map(r => <div key={r.id} className="flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer" onClick={() => nav('/plan/r/' + r.id)}>
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white bg-acc"><Icon name={glyphOf(r.emoji)} /></span>
          <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em]">{r.name}</div><div className="text-label-2 text-[13px] mt-0.5">{exCount(r.ex.length)}</div></div>
          <Icon name="chevronRight" className="text-label shrink-0 text-[15px] [--icon-stroke:2.4]" /></div>)}</div> : <>
          <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]"><div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
          <Button icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (Push / Pull / Legs)')}</Button>
        </>}
      </div>
    </div>
  </>
}

import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { WorkoutRow, workoutDetailSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  return <>
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-3"><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('History')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('{0} workouts', S.workouts.length)}</div></div>
    </div>
    {S.workouts.length ? <div className="flex flex-col gap-2 desk:grid desk:grid-cols-2 desk:gap-2">{[...S.workouts].reverse().map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
      : <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]"><div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}

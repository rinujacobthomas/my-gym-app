import { useEffect } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

const clock = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')

// One bar, two meanings: the rest countdown between sets, and the work countdown during a
// timed set (issue #16). They are mutually exclusive by construction — startWork() stops any
// running rest — so the bar can never have to show both, and a work set gets its own colour
// plus a "Done" that logs the time actually held.
export default function RestTimer() {
  const timer = useUI(s => s.timer)
  const work = useUI(s => s.work)
  const { addRest, stopRest, finishWorkEarly, stopWork } = useUI()
  const on = work || timer
  // The bar is fixed above the tab bar and floats over whatever is beneath it — during a
  // rest that was the next set's row. Extra bottom padding lets the page scroll clear.
  useEffect(() => {
    document.body.classList.toggle('resting', !!on)
    return () => document.body.classList.remove('resting')
  }, [!!on])
  if (!on) return null
  const pct = (on.left / on.total) * 100

  const shell = 'fixed z-[60] left-3 right-3 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] rounded-2xl p-3 px-3.5 ' +
    'bg-[color-mix(in_srgb,var(--surface)_97%,transparent)] backdrop-blur-[24px] backdrop-saturate-180 no-tap ' +
    'shadow-[0_12px_34px_-8px_rgba(0,0,0,.55)] animate-[slideup_220ms_var(--ease)] ' +
    'desk:left-1/2 desk:right-auto desk:-ml-[260px] desk:w-[520px] desk:bottom-[112px]'

  if (work) return (
    <div id="timer" className={shell + ' flex items-center gap-3 border-[0.5px] border-acc'}>
      <div className="text-[26px] font-semibold tracking-[-.026em] tabular-nums min-w-[66px] text-acc">{clock(work.left)}</div>
      <div className="flex-1 min-w-0">
        {work.label && <div className="text-[12px] text-label-2 mb-[5px] capitalize whitespace-nowrap overflow-hidden text-ellipsis">{work.label}</div>}
        <div className="h-1 bg-surface-3 rounded-full overflow-hidden"><i className="block h-full bg-acc transition-[width] duration-1000" style={{ width: pct + '%' }} /></div>
      </div>
      <Button size="sm" onClick={stopWork}>{t('Cancel')}</Button>
      <Button size="sm" variant="primary" icon="check" onClick={finishWorkEarly}>{t('Done')}</Button>
    </div>
  )
  // Three controls plus the clock don't fit one line on a phone — at 360px the bar is left
  // with about 30px and stops saying anything. So the rest variant stacks: clock and bar
  // read at a glance, controls get their own row. −15 and +15 sit together in number-line
  // order; Skip is pushed to the far edge, away from the button you tap to buy more time.
  // On desk the single line fits again (520px).
  return (
    <div id="timer" className={shell + ' flex flex-col gap-2.5 desk:flex-row desk:items-center desk:gap-3.5'}>
      <div className="flex items-center gap-3 desk:flex-1 desk:min-w-0">
        <div className="text-[26px] font-semibold tracking-[-.026em] tabular-nums min-w-[66px]">{clock(timer.left)}</div>
        <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden"><i className="block h-full bg-acc transition-[width] duration-1000" style={{ width: pct + '%' }} /></div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" icon="minus" onClick={() => addRest(-15)}>15s</Button>
        <Button size="sm" icon="plus" onClick={() => addRest(15)}>15s</Button>
        <Button size="sm" variant="primary" className="ml-auto! min-w-[84px]!" onClick={stopRest}>{t('Skip')}</Button>
      </div>
    </div>
  )
}

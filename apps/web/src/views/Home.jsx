import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutine, effectiveRoutineId, streakWeeks, lastBW, setsDoneActive } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekKey, DAYS } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, loadStarterPlan, bwDeltaColor } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { glyphOf } from '../lib/glyphs.js'

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
// Mobile: one column. Desk (≥1000px): the cards flow into a two-column grid —
// week + body weight up top, welcome/streak filling in beside them.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  const routine = effectiveRoutine(S, todayISO())
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineId(S, iso), ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    const dot = done ? 'bg-acc' : ovr && eff ? 'bg-orange' : eff ? 'bg-label-3' : 'bg-transparent'
    const isToday = iso === todayISO()
    strip.push(<div key={i} onClick={() => dayOverrideSheet(iso)}
      className="flex-1 text-center pt-2 px-0.5 pb-[9px] rounded-[10px] no-tap transition-colors duration-150 active:bg-surface-2 cursor-pointer">
      <div className="text-[11px] text-label-3 font-medium uppercase tracking-[.03em]">{t(DAYS[d.getDay()])}</div>
      <div className={'text-[17px] font-normal tracking-[-.012em] my-1 ' + (isToday ? 'leading-none' : '')}>
        <span className={isToday ? 'inline-flex bg-acc text-on-acc font-semibold w-[31px] h-[31px] rounded-full items-center justify-center mx-auto my-0.5' : ''}>{d.getDate()}</span>
      </div>
      <div className={'w-[5px] h-[5px] rounded-full mx-auto ' + dot} />
    </div>)
  }
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${monday.getDate()} ${monday.toLocaleDateString(dateLocale(), { month: 'short' })} – ${sunday.getDate()} ${sunday.toLocaleDateString(dateLocale(), { month: 'short' })}`

  const wThisWeek = S.workouts.filter(w => weekKey(w.d) === weekKey(todayISO())).length
  const plannedPerWeek = Object.keys(S.week).filter(k => S.week[k]).length
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (routine) startFlow(routine.id); else dayOverrideSheet(todayISO()) }

  return <div className="max-w-[640px] mx-auto desk:max-w-none desk:grid desk:grid-cols-2 desk:gap-x-3.5 desk:items-start">
    <div className="desk:col-span-2 flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <div>
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{user ? t('Hi {0}', user.name) : 'openGym'}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="bg-surface rounded-[14px] p-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <button className="w-[30px] h-[30px] rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[15px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => setWeekOffset(w => w - 1)} aria-label="Previous week"><Icon name="chevronLeft" /></button>
        <div className="text-[13px] leading-[1.38] text-label-2 font-medium">{wkLabel}</div>
        <button className="w-[30px] h-[30px] rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[15px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => setWeekOffset(w => w + 1)} aria-label="Next week"><Icon name="chevronRight" /></button>
      </div>
      <div className="flex justify-between gap-1">{strip}</div>
      <div className="flex items-center justify-between gap-2.5 mt-3 px-3.5 py-3 rounded-xl bg-surface-2 transition-colors duration-150 w-full text-left no-tap active:bg-surface-3 cursor-pointer" onClick={onToday}>
        <div className="flex items-center gap-[9px] min-w-0">
          <span className={'w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white ' + (S.active ? 'bg-orange' : routine ? 'bg-acc' : 'bg-surface-3')}>
            <Icon name={S.active ? 'timer' : routine ? glyphOf(routine.emoji) : 'moon'} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-medium tracking-[.03em] uppercase text-label-3">{t('Today')}</div>
            <div className="font-medium text-[17px] leading-[1.25] capitalize tracking-[-.012em] whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">{S.active ? t('{0} — in progress', S.active.name) : routine ? routine.name : t('Rest day')}{todayOvr && routine ? ' · ' + t('rescheduled') : ''}</div>
          </div>
        </div>
        {S.active ? <span className="inline-flex items-center gap-[3px] rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 text-orange bg-[color-mix(in_srgb,var(--orange)_16%,transparent)]">{t('Resume')}</span>
          : routine ? <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium capitalize shrink-0">{t('Start')}</span>
          : <Icon name="plus" className="text-label shrink-0 text-[15px] [--icon-stroke:2.4]" />}
      </div>
    </div>

    {!S.routines.length && !S.active && (
      <div className="bg-surface rounded-[14px] p-4 mb-3">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[18px] flex items-center justify-center text-white bg-acc"><Icon name="sparkles" /></span>
          <div className="text-[22px] font-semibold tracking-[-.026em] leading-[1.1]">{t('Welcome!')}</div>
        </div>
        <div className="text-label-2 text-[13px] leading-[1.38] mb-3">{t('Set up your weekly routine to get going — or load a ready-made Push / Pull / Legs plan.')}</div>
        <Button variant="primary" icon="sparkles" onClick={loadStarterPlan}>{t('Load starter plan (PPL)')}</Button>
        <div className="h-2" /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="bg-surface rounded-[14px] p-4 mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">{t('Body weight')}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" icon="target" className={S.targetW ? 'text-yellow!' : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="flex items-center gap-2 baseline">
          <div className="text-[30px] font-semibold tracking-[-.026em] leading-[1.1]">{fmtNum(bw.w)} <span className="text-label-2 text-[16px] font-normal">{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="flex items-center gap-0.5 text-[13px] leading-[1.38] font-medium" style={{ color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} className="text-[12px]" />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="text-label-3 text-[13px] leading-[1.38] ml-auto">{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="flex items-center gap-[5px] text-[13px] leading-[1.38] text-yellow mt-1">
            <Icon name="target" className="text-[13px]" />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="w-full overflow-hidden mt-2"><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="text-label-2 text-[13px] leading-[1.38]">{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>

    <div className="bg-surface rounded-[14px] p-4 mb-3 cursor-pointer" onClick={() => calendarSheet()}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-[7px] text-[22px] font-semibold tracking-[-.021em]">
            <Icon name="flame" className="text-orange" />
            {t('{0} week streak', streakWeeks(S))}
          </div>
          <div className="text-label-2 text-[13px] leading-[1.38] mt-0.5">{wThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {t(S.workouts.length === 1 ? '{0} workout total' : '{0} workouts total', S.workouts.length)}</div>
        </div>
        <Icon name="calendar" className="text-label shrink-0 text-[20px] [--icon-stroke:2.4]" />
      </div>
    </div>
  </div>
}

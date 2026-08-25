import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useUI } from '../store/useUI.js'
import { todayISO, isoOf, fmtNum, uid } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, SearchField, Segmented, SelectRow, Stepper, TextField } from '../components/ui.jsx'

const MEALS = [
  { id: 'BREAKFAST', label: 'Breakfast', icon: 'sun' },
  { id: 'LUNCH', label: 'Lunch', icon: 'plate' },
  { id: 'DINNER', label: 'Dinner', icon: 'moon' },
  { id: 'SNACK', label: 'Snacks', icon: 'sparkles' },
]
const MACROS = [
  { key: 'proteinG', pctKey: 'proteinPct', label: 'Protein', color: 'var(--blue)', kcalPerG: 4 },
  { key: 'carbsG', pctKey: 'carbsPct', label: 'Carbs', color: 'var(--orange)', kcalPerG: 4 },
  { key: 'fatG', pctKey: 'fatPct', label: 'Fat', color: 'var(--yellow)', kcalPerG: 9 },
]
const SEC_H = 'text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1'

const activityOptions = () => [
  { value: 'sedentary', label: t('Sedentary') },
  { value: 'light', label: t('Lightly active') },
  { value: 'moderate', label: t('Moderately active') },
  { value: 'active', label: t('Very active') },
  { value: 'athlete', label: t('Athlete') },
]

function Ring({ value, max, size = 128, stroke = 12 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const over = max > 0 && value > max
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'var(--orange)' : 'var(--acc)'} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
        style={{ transition: 'stroke-dashoffset .4s var(--ease)' }} />
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="text-[26px] font-semibold tracking-[-.026em] leading-none">{fmtNum(Math.round(value))}</div>
      {max > 0 && <div className="text-label-3 text-[12px] mt-1">/ {fmtNum(Math.round(max))} {t('kcal')}</div>}
    </div>
  </div>
}

function MacroBar({ g, targetPct, kcalTotal, kcalPerG, label, color }) {
  const kcal = g * kcalPerG
  const base = targetPct > 0 ? targetPct : 100 / 3
  const pct = kcalTotal > 0 && base > 0 ? Math.min(100, Math.round((kcal / kcalTotal * 100) / base * 100)) : 0
  return <div className="flex items-center gap-2.5">
    <span className="text-[13px] w-[52px] shrink-0" style={{ color }}>{label}</span>
    <span className="h-[5px] rounded-full bg-surface-2 overflow-hidden flex-1">
      <span className="block h-full rounded-full" style={{ width: pct + '%', background: color }} />
    </span>
    <span className="text-[13px] text-label-2 w-[46px] text-right shrink-0">{fmtNum(Math.round(g))}g</span>
  </div>
}

const Droplet = ({ className }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" className={'icn ' + (className || '')}>
    <path d="M12 3.6c3.4 4.1 5.4 6.8 5.4 9.4a5.4 5.4 0 1 1-10.8 0c0-2.6 2-5.3 5.4-9.4Z" />
  </svg>
)

export default function NutritionView() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const [iso, setIso] = useState(todayISO())
  const [panelMeal, setPanelMeal] = useState(null)
  const dayQ = useQuery({ queryKey: qk.nutrition(iso), queryFn: () => api('/api/nutrition?date=' + iso) })
  const entries = (dayQ.data && dayQ.data.entries) || []
  const water = dayQ.data ? dayQ.data.water || 0 : 0
  const target = dayQ.data ? dayQ.data.target : null

  const shiftDate = n => {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + n)
    setIso(isoOf(d))
  }

  const totals = useMemo(() => entries.reduce((a, e) => {
    const sv = e.servings || 1
    a.kcal += (e.kcal || 0) * sv; a.proteinG += (e.proteinG || 0) * sv
    a.carbsG += (e.carbsG || 0) * sv; a.fatG += (e.fatG || 0) * sv
    return a
  }, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }), [entries])

  const addEntry = async e => {
    const tmpId = 'tmp-' + uid()
    const patch = d => d && { ...d, entries: [...(d.entries || []), { id: tmpId, meal: e.meal, name: e.name, kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, servings: e.servings || 1 }] }
    qc.setQueryData(qk.nutrition(iso), patch)
    try {
      await api('/api/nutrition', {
        method: 'POST',
        body: JSON.stringify({ date: iso, meal: e.meal, name: e.name, kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, servings: e.servings || 1, source: e.source || 'MANUAL' }),
      })
      qc.invalidateQueries({ queryKey: qk.nutrition(iso) })
    } catch {
      qc.setQueryData(qk.nutrition(iso), d => d && { ...d, entries: (d.entries || []).filter(x => x.id !== tmpId) })
      toast(t('Could not add {0}', e.name))
    }
  }

  const delEntry = en => {
    if (String(en.id).startsWith('tmp-')) return
    confirmSheet({
      title: t('Remove {0}?', en.name),
      message: t('It will be removed from this day.'),
      confirmText: t('Remove'), danger: true,
      onConfirm: async () => {
        const snap = qc.getQueryData(qk.nutrition(iso))
        qc.setQueryData(qk.nutrition(iso), d => d && { ...d, entries: (d.entries || []).filter(x => x.id !== en.id) })
        try {
          await api('/api/nutrition/' + en.id, { method: 'DELETE' })
          qc.invalidateQueries({ queryKey: qk.nutrition(iso) })
        }
        catch { if (snap) qc.setQueryData(qk.nutrition(iso), snap); toast(t('Could not remove it')) }
      },
    })
  }

  const addWater = async ml => {
    const prev = water
    qc.setQueryData(qk.nutrition(iso), d => d && { ...d, water: (d.water || 0) + ml })
    try {
      await api('/api/nutrition/water', { method: 'PUT', body: JSON.stringify({ date: iso, ml: prev + ml }) })
      qc.invalidateQueries({ queryKey: qk.nutrition(iso) })
    }
    catch {
      qc.setQueryData(qk.nutrition(iso), d => d && { ...d, water: prev })
      toast(t('Could not save water'))
    }
  }

  return <div>
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5 min-w-0">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Nutrition')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1 truncate">{iso === todayISO() ? t('Today') : new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button className="w-[30px] h-[30px] rounded-full bg-surface text-label flex items-center justify-center text-[15px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => shiftDate(-1)} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <button className="w-[30px] h-[30px] rounded-full bg-surface text-label flex items-center justify-center text-[15px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap disabled:opacity-30" onClick={() => shiftDate(1)} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
      </div>
    </div>

    <div className="bg-surface rounded-[14px] p-4 mb-3">
      {dayQ.isPending ? <div className="h-32 animate-pulse" /> : <>
        <div className="flex items-center gap-5">
          <Ring value={totals.kcal} max={target ? target.kcal : 0} />
          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            {MACROS.map(m => <MacroBar key={m.key} label={t(m.label)} color={m.color} kcalPerG={m.kcalPerG}
              g={totals[m.key]} kcalTotal={totals.kcal || 1}
              targetPct={target ? target[m.pctKey] : 0} />)}
            {!target && <div className="text-label-3 text-[13px] leading-[1.38]">{t('No calorie target yet — set one with the calculator below.')}</div>}
          </div>
        </div>
      </>}
    </div>

    <div className="bg-surface rounded-[14px] p-4 mb-3 flex items-center gap-3">
      <span className="w-[34px] h-[34px] rounded-[9px] shrink-0 text-[18px] flex items-center justify-center text-white bg-teal"><Droplet /></span>
      <div className="min-w-0">
        <div className="text-[17px] font-medium tracking-[-.012em] leading-[1.25]">{fmtNum(water)} <span className="text-label-2 text-[14px] font-normal">ml</span></div>
        <div className="text-label-3 text-[13px] leading-[1.3]">{t('Water today')}</div>
      </div>
      <div className="ml-auto flex gap-2">
        {[250, 500].map(ml => (
          <Button key={ml} size="sm" variant="tinted" onClick={() => addWater(ml)}>+{ml}</Button>
        ))}
      </div>
    </div>

    {MEALS.map(meal => {
      const list = entries.filter(e => e.meal === meal.id)
      const kcal = list.reduce((a, e) => a + (e.kcal || 0) * (e.servings || 1), 0)
      return <div key={meal.id} className="bg-surface rounded-[14px] mb-3 overflow-hidden">
        <div className="flex items-center gap-[9px] px-3.5 pt-3 pb-2">
          <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white bg-acc"><Icon name={meal.icon} /></span>
          <div className="flex-1 min-w-0 text-[17px] font-semibold tracking-[-.012em]">{t(meal.label)}</div>
          {!!kcal && <span className="text-label-2 text-[14px]">{fmtNum(Math.round(kcal))} {t('kcal')}</span>}
        </div>
        {list.length ? list.map(e => (
          <div key={e.id} className="lrow relative flex items-center gap-3 pl-3.5 pr-2 py-[9px]">
            <div className="flex-1 min-w-0">
              <div className="text-[16px] tracking-[-.009em] leading-[1.25] truncate">{e.name}{e.servings && e.servings !== 1 ? <span className="text-label-3"> ×{e.servings}</span> : null}</div>
              <div className="text-label-3 text-[12px] leading-[1.3] mt-px">
                P {fmtNum(Math.round((e.proteinG || 0) * (e.servings || 1)))} · C {fmtNum(Math.round((e.carbsG || 0) * (e.servings || 1)))} · F {fmtNum(Math.round((e.fatG || 0) * (e.servings || 1)))}
              </div>
            </div>
            <span className="text-[15px] text-label-2 shrink-0">{fmtNum(Math.round((e.kcal || 0) * (e.servings || 1)))}</span>
            {!String(e.id).startsWith('tmp-') && <button className="rounded-full shrink-0 bg-transparent text-label-3 w-9 h-9 flex items-center justify-center transition-colors duration-150 active:bg-surface-2 hover:text-red no-tap"
              onClick={() => delEntry(e)} aria-label={t('Remove')}><Icon name="trash" className="text-[16px]" /></button>}
          </div>
        )) : <div className="text-label-3 text-[13px] leading-[1.38] px-3.5 pb-1">{t('Nothing logged.')}</div>}
        <div className="p-2.5 pt-1.5">
          <Button size="sm" variant="tinted" icon="plus" className="w-full!" onClick={() => setPanelMeal(meal.id)}>{t('Add food')}</Button>
        </div>
      </div>
    })}

    <TdeeCard iso={iso} />

    <div className="h-2" />

    {panelMeal && <AddFoodPanel meal={panelMeal} close={() => setPanelMeal(null)} addEntry={addEntry} />}
  </div>
}

function TdeeCard({ iso }) {
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const [w, setW] = useState(70)
  const [h, setH] = useState(170)
  const [age, setAge] = useState(30)
  const [sex, setSex] = useState('male')
  const [act, setAct] = useState('moderate')
  const [goal, setGoal] = useState('maintain')
  const [busy, setBusy] = useState(false)
  const [kcal, setKcal] = useState(null)

  const calc = async () => {
    if (busy) return
    setBusy(true)
    try {
      const qs = new URLSearchParams({ weight: String(w), height: String(h), age: String(age), sex, activity: act, goal })
      const d = await api('/api/nutrition/tdee?' + qs.toString())
      setKcal(Math.round(d.kcal))
    } catch { toast(t('Could not calculate — check the numbers')) }
    finally { setBusy(false) }
  }

  const apply = async () => {
    try {
      await api('/api/profile', { method: 'PUT', body: JSON.stringify({ dailyCalorieTarget: kcal }) })
      toast(t('Daily target set to {0} kcal', fmtNum(kcal)))
      qc.invalidateQueries({ queryKey: qk.profile })
      qc.invalidateQueries({ queryKey: qk.nutrition(iso) })
    } catch { toast(t('Could not set the target')) }
  }

  return <div className="bg-surface rounded-[14px] p-4 mb-3">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">{t('Calorie target calculator')}</h2>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Stepper label={t('Weight')} unit="kg" value={w} step={1} decimal={false} onChange={v => setW(Math.max(20, Math.min(300, Math.round(v) || 1)))} />
      <Stepper label={t('Height')} unit="cm" value={h} step={1} decimal={false} onChange={v => setH(Math.max(80, Math.min(250, Math.round(v) || 1)))} />
      <Stepper label={t('Age')} value={age} step={1} decimal={false} onChange={v => setAge(Math.max(10, Math.min(100, Math.round(v) || 1)))} />
    </div>
    <Segmented className="mt-3" value={sex} onChange={setSex}
      options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
    <div className="bg-surface rounded-[14px] overflow-hidden mt-3 -mx-0.5">
      <SelectRow title={t('Activity')} sheetTitle={t('Activity level')} value={act} onChange={setAct} options={activityOptions()} />
    </div>
    <Segmented className="mt-3" value={goal} onChange={setGoal}
      options={[{ value: 'lose', label: t('Lose') }, { value: 'maintain', label: t('Maintain') }, { value: 'gain', label: t('Gain') }]} />
    <div className="mt-3"><Button variant="primary" icon="target" disabled={busy} onClick={calc}>{busy ? t('Calculating…') : t('Calculate')}</Button></div>
    {kcal != null && <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t-[0.5px] border-sep">
      <div>
        <div className="text-[26px] font-semibold tracking-[-.026em] leading-none">{fmtNum(kcal)} <span className="text-label-2 text-[14px] font-normal">{t('kcal/day')}</span></div>
      </div>
      <Button size="sm" variant="tinted" icon="check" onClick={apply}>{t('Set as target')}</Button>
    </div>}
  </div>
}

function AddFoodPanel({ meal, close, addEntry }) {
  const mealLabel = (MEALS.find(m => m.id === meal) || {}).label || meal
  const [tab, setTab] = useState('search')

  useEffect(() => {
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => { b.position = b.top = b.left = b.right = b.width = ''; window.scrollTo(0, y) }
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return <div className="fixed inset-0 z-[110]">
    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] touch-none overscroll-none" onClick={close} />
    <div className="absolute inset-x-0 bottom-0 bg-bg-el rounded-t-[22px] px-[18px] pt-2 pb-[calc(20px+env(safe-area-inset-bottom,0px))] max-h-[90vh] flex flex-col animate-[sheetup_.34s_var(--ease)] desk:left-1/2 desk:right-auto desk:-ml-[320px] desk:w-[640px]">
      <div className="w-9 h-[5px] rounded-full bg-label-4 mx-auto mt-1.5 mb-3 shrink-0" />
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-[20px] font-semibold tracking-[-.021em] m-0">{t('Add to {0}', t(mealLabel))}</h3>
        <button className="w-[30px] h-[30px] rounded-full bg-surface-2 text-label-2 flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-3 active:scale-90 no-tap" onClick={close} aria-label={t('Close')}><Icon name="xmark" className="text-[14px]" /></button>
      </div>
      <Segmented className="mb-3 shrink-0" value={tab} onChange={setTab}
        options={[
          { value: 'search', label: t('Search') },
          { value: 'barcode', label: t('Barcode') },
          { value: 'manual', label: t('Manual') },
          { value: 'favorites', label: t('Favorites') },
        ]} />
      <div className="overflow-y-auto overscroll-contain touch-pan-y min-h-0">
        {tab === 'search' && <OffSearch meal={meal} addEntry={addEntry} />}
        {tab === 'barcode' && <BarcodeTab meal={meal} addEntry={addEntry} />}
        {tab === 'manual' && <ManualForm meal={meal} addEntry={addEntry} close={close} />}
        {tab === 'favorites' && <Favorites meal={meal} addEntry={addEntry} />}
      </div>
    </div>
  </div>
}

const productToEntry = (p, meal) => ({
  meal,
  name: p.name || p.product_name || t('Food'),
  kcal: Math.round(p.kcal100 ?? p.kcal_100g ?? 0),
  proteinG: Math.round((p.protein100 ?? p.proteins_100g ?? 0) * 10) / 10,
  carbsG: Math.round((p.carbs100 ?? p.carbohydrates_100g ?? 0) * 10) / 10,
  fatG: Math.round((p.fat100 ?? p.fat_100g ?? 0) * 10) / 10,
  servings: 1,
  source: 'OFF_SEARCH',
})

function OffSearch({ meal, addEntry }) {
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const favQ = useQuery({ queryKey: qk.favorites, queryFn: () => api('/api/nutrition/favorites') })
  const favs = favQ.data || []
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')

  // debounce keystrokes before they become queries
  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setDq(''); return }
    const tm = setTimeout(() => setDq(s), 350)
    return () => clearTimeout(tm)
  }, [q])

  const searchQ = useQuery({
    queryKey: ['nutrition', 'off-search', dq],
    queryFn: () => api('/api/nutrition/off/search?q=' + encodeURIComponent(dq)),
    enabled: dq.length >= 2,
    staleTime: 300_000,
  })
  const res = dq.length >= 2 ? ((searchQ.data && searchQ.data.results) || []) : null
  const searching = dq.length >= 2 && searchQ.isFetching

  const clear = () => { setQ(''); setDq('') }

  const isFav = p => favs.some(f => (f.offId || f.id) === p.id)
  const toggleFav = async p => {
    const ex = favs.find(f => (f.offId || f.id) === p.id)
    if (ex) {
      const snap = favs
      qc.setQueryData(qk.favorites, d => (d || []).filter(f => f !== ex))
      try {
        await api('/api/nutrition/favorites/' + ex.id, { method: 'DELETE' })
        qc.invalidateQueries({ queryKey: qk.favorites })
      }
      catch { qc.setQueryData(qk.favorites, snap); toast(t('Could not update favorites')) }
    } else {
      const tmp = { offId: p.id, id: 'tmp-fav-' + (p.offId || p.id), name: p.name, kcal100: p.kcal100, protein100: p.protein100, carbs100: p.carbs100, fat100: p.fat100, servingSize: p.servingSize }
      qc.setQueryData(qk.favorites, d => [...(d || []), tmp])
      try {
        await api('/api/nutrition/favorites', { method: 'POST', body: JSON.stringify({ offId: p.id, name: p.name, kcal100: p.kcal100, protein100: p.protein100, carbs100: p.carbs100, fat100: p.fat100, servingSize: p.servingSize }) })
        qc.invalidateQueries({ queryKey: qk.favorites })
      }
      catch { qc.setQueryData(qk.favorites, d => (d || []).filter(f => f !== tmp)); toast(t('Could not update favorites')) }
    }
  }

  return <div>
    <SearchField autoFocus placeholder={t('Search Open Food Facts…')} value={q}
      onChange={e => setQ(e.target.value)} onClear={clear} />
    {res && !res.length && !searching && <div className="text-label-2 text-[13px] leading-[1.38] text-center py-6 px-4">{t('No matches — try another name or scan the barcode.')}</div>}
    {res && res.length > 0 && <div className="bg-surface rounded-[14px] overflow-hidden mt-2.5">
      {res.slice(0, 25).map(p => (
        <div key={p.id} className="lrow relative flex items-center gap-2 px-3 py-[7px]">
          <button className="flex-1 min-w-0 text-left py-1 active:opacity-50 no-tap" onClick={() => { addEntry(productToEntry(p, meal)); clear() }}>
            <div className="text-[16px] tracking-[-.009em] leading-[1.25] truncate">{p.name || p.product_name}</div>
            <div className="text-label-3 text-[12px] leading-[1.3] mt-px">{Math.round(p.kcal100 ?? 0)} {t('kcal/100g')} · P {Math.round(p.protein100 ?? 0)} · C {Math.round(p.carbs100 ?? 0)} · F {Math.round(p.fat100 ?? 0)}</div>
          </button>
          <button className="shrink-0 w-9 h-9 flex items-center justify-center no-tap active:scale-90 transition-transform duration-150"
            onClick={() => toggleFav(p)} aria-label={isFav(p) ? t('Unfavorite') : t('Favorite')}>
            <Icon name={isFav(p) ? 'starFill' : 'star'} className={'text-[18px] ' + (isFav(p) ? 'text-yellow' : 'text-label-3')} />
          </button>
          <button className="shrink-0 rounded-lg bg-acc-soft text-acc w-8 h-8 flex items-center justify-center no-tap active:scale-90 transition-transform duration-150"
            onClick={() => { addEntry(productToEntry(p, meal)); clear() }} aria-label={t('Add')}>
            <Icon name="plus" className="text-[15px]" />
          </button>
        </div>
      ))}
    </div>}
    {!res && !searching && q.trim().length < 2 && <div className="text-label-3 text-[13px] leading-[1.38] text-center py-6">{t('Type at least two letters to search a database of millions of foods.')}</div>}
    {searching && <div className="py-4 flex justify-center"><div className="h-10 w-full max-w-[280px] bg-surface rounded-xl animate-pulse" /></div>}
  </div>
}

function BarcodeTab({ meal, addEntry }) {
  const toast = useUI(s => s.toast)
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [scanning, setScanning] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const lookup = async raw => {
    const val = String(raw || '').trim()
    if (!val) return
    setBusy(true)
    try {
      const d = await api('/api/nutrition/off/barcode/' + encodeURIComponent(val))
      if (d && d.product) { addEntry(productToEntry(d.product, meal)); setCode(''); toast(t('Found it 💪')) }
      else toast(t('Product not found in the database'))
    } catch { toast(t('Lookup failed — try again')) }
    finally { setBusy(false) }
  }

  const stopScan = () => {
    setScanning(false)
    if (streamRef.current) { streamRef.current.getTracks().forEach(tr => tr.stop()); streamRef.current = null }
  }

  useEffect(() => stopScan, [])

  const startScan = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      setScanning(true)
    } catch { toast(t('Camera unavailable — enter the code by hand below')) }
  }

  useEffect(() => {
    if (!scanning) return
    let timer = null
    let dead = false
    ;(async () => {
      try {
        const v = videoRef.current
        v.srcObject = streamRef.current
        await v.play()
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        timer = setInterval(async () => {
          if (dead) return
          try {
            const found = await detector.detect(v)
            if (found.length) {
              dead = true
              const val = found[0].rawValue
              stopScan()
              lookup(val)
            }
          } catch { /* frame not ready */ }
        }, 350)
      } catch { toast(t('Scanner failed — enter the code by hand')); stopScan() }
    })()
    return () => { dead = true; if (timer) clearInterval(timer) }
  }, [scanning])

  return <div>
    {supported && !scanning && <Button variant="primary" icon="magnifier" onClick={startScan}>{t('Scan barcode')}</Button>}
    {scanning && <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] mb-3">
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-white/80 rounded-lg pointer-events-none" />
      <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center no-tap" onClick={stopScan} aria-label={t('Stop')}><Icon name="xmark" className="text-[14px]" /></button>
    </div>}
    <div className={SEC_H.replace('mt-[22px]', 'mt-4')}>{t('Enter code by hand')}</div>
    <div className="flex gap-2">
      <TextField inputMode="numeric" placeholder={t('Barcode number')} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))} />
      <Button variant="tinted" disabled={!code || busy} onClick={() => lookup(code)}>{busy ? t('…') : t('Find')}</Button>
    </div>
    <div className="text-label-3 text-[13px] leading-[1.38] mt-3">{t('Most packaged foods carry a barcode — scanning pulls the exact nutrition per 100 g.')}</div>
  </div>
}

function ManualForm({ meal, addEntry, close }) {
  const toast = useUI(s => s.toast)
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState(0)
  const [p, setP] = useState(0)
  const [c, setC] = useState(0)
  const [f, setF] = useState(0)

  const submit = () => {
    if (!name.trim()) { toast(t('Give it a name first')); return }
    addEntry({ meal, name: name.trim(), kcal: Math.round(kcal), proteinG: p, carbsG: c, fatG: f, servings: 1, source: 'MANUAL' })
    close()
  }

  return <div>
    <div className={SEC_H.replace('mt-[22px]', 'mt-1')}>{t('Name')}</div>
    <TextField placeholder={t('Grandma\'s dal')} value={name} onChange={e => setName(e.target.value)} />
    <div className={SEC_H}>{t('Per serving')}</div>
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-surface rounded-xl px-3 py-2">
        <div className="text-label-3 text-[12px] mb-0.5">{t('Calories')}</div>
        <NumberField value={kcal} decimal={false} onChange={setKcal} className="text-left!" />
      </div>
      <div className="bg-surface rounded-xl px-3 py-2">
        <div className="text-label-3 text-[12px] mb-0.5">{t('Protein')} (g)</div>
        <NumberField value={p} onChange={setP} className="text-left!" />
      </div>
      <div className="bg-surface rounded-xl px-3 py-2">
        <div className="text-label-3 text-[12px] mb-0.5">{t('Carbs')} (g)</div>
        <NumberField value={c} onChange={setC} className="text-left!" />
      </div>
      <div className="bg-surface rounded-xl px-3 py-2">
        <div className="text-label-3 text-[12px] mb-0.5">{t('Fat')} (g)</div>
        <NumberField value={f} onChange={setF} className="text-left!" />
      </div>
    </div>
    <div className="mt-3"><Button variant="primary" icon="plus" onClick={submit}>{t('Add to diary')}</Button></div>
  </div>
}

function Favorites({ meal, addEntry }) {
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const favQ = useQuery({ queryKey: qk.favorites, queryFn: () => api('/api/nutrition/favorites') })
  const favs = favQ.data || []

  const removeFav = async f => {
    const snap = favQ.data
    qc.setQueryData(qk.favorites, d => (d || []).filter(x => x !== f))
    try {
      await api('/api/nutrition/favorites/' + f.id, { method: 'DELETE' })
      qc.invalidateQueries({ queryKey: qk.favorites })
    }
    catch { if (snap) qc.setQueryData(qk.favorites, snap); toast(t('Could not update favorites')) }
  }

  if (!(favs.length || favQ.isPending)) return <div className="text-center py-8">
    <Icon name="star" className="text-[26px] text-label-3 mx-auto" />
    <div className="text-label-2 text-[13px] leading-[1.38] mt-2 px-6">{t('Star foods while searching and they will live here for one-tap logging.')}</div>
  </div>

  return <div className="bg-surface rounded-[14px] overflow-hidden">
    {favQ.isPending && <div className="p-3 space-y-2">
      <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
      <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
    </div>}
    {favs.map(f => (
      <div key={f.id} className="lrow relative flex items-center gap-2 px-3 py-[7px]">
        <button className="flex-1 min-w-0 text-left py-1 active:opacity-50 no-tap"
          onClick={() => addEntry(productToEntry({ name: f.name, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100 }, meal))}>
          <div className="text-[16px] tracking-[-.009em] leading-[1.25] truncate">{f.name}</div>
          <div className="text-label-3 text-[12px] leading-[1.3] mt-px">{Math.round(f.kcal100 ?? 0)} {t('kcal/100g')}</div>
        </button>
        <button className="shrink-0 w-9 h-9 flex items-center justify-center no-tap active:scale-90 transition-transform duration-150" onClick={() => removeFav(f)} aria-label={t('Remove')}>
          <Icon name="starFill" className="text-[18px] text-yellow" />
        </button>
        <button className="shrink-0 rounded-lg bg-acc-soft text-acc w-8 h-8 flex items-center justify-center no-tap active:scale-90 transition-transform duration-150"
          onClick={() => addEntry(productToEntry({ name: f.name, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100 }, meal))} aria-label={t('Add')}>
          <Icon name="plus" className="text-[15px]" />
        </button>
      </div>
    ))}
  </div>
}

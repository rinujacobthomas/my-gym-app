import { useEffect, useState } from 'react'
import { api } from '@og/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Switch } from '@og/ui'
import Icon from '@og/ui'
import { todayISO, fmtDate } from '@og/core'
import { hhmm } from '../lib/format.js'
import {
  PageHead, Empty, SkelList, BusyBtn, Pill, TimeField,
  TextField, ErrorBox, copyText, errText, toast,
} from '../components/bits.jsx'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

let keySeq = 1
const nextKey = () => 'k' + keySeq++ + '_' + Math.random().toString(36).slice(2, 6)

const withKeys = rows => (rows || []).map(t => ({ ...t, _key: t._key || nextKey() }))

export default function Slots() {
  const qc = useQueryClient()
  const [tpl, setTpl] = useState(null)
  const [dirty, setDirty] = useState(false)

  const tplQ = useQuery({
    queryKey: ['admin', 'templates'],
    queryFn: () => api('/api/admin/templates'),
  })
  useEffect(() => {
    if (tplQ.data) { setTpl(withKeys(tplQ.data)); setDirty(false) }
  }, [tplQ.data])

  const err = tplQ.isError ? errText(tplQ.error) : null

  const update = (key, patch) => {
    setTpl(prev => prev.map(t => (t._key === key ? { ...t, ...patch } : t)))
    setDirty(true)
  }
  const remove = key => {
    setTpl(prev => prev.filter(t => t._key !== key))
    setDirty(true)
  }
  const addSlot = weekday => {
    setTpl(prev => [...prev, { _key: nextKey(), id: null, _new: true, name: 'Slot', weekday, startMin: 540, endMin: 600, capacity: 20, isActive: true }])
    setDirty(true)
  }

  const saveM = useMutation({
    mutationFn: templates => api('/api/schedule/templates', { method: 'PUT', body: JSON.stringify({ templates }) }),
    onSuccess: r => {
      toast(`Saved ${r.count} slots — applies to future generated dates`)
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['admin', 'templates'] })
    },
    onError: e => toast(errText(e)),
  })

  const save = () => {
    const templates = tpl.map(({ _key, _new, id, ...t }) => ({
      ...(id && !_new ? { id } : {}),
      name: t.name?.trim() || 'Slot',
      weekday: Math.max(0, Math.min(6, Math.round(+t.weekday || 0))),
      startMin: Math.max(0, Math.round(+t.startMin || 0)),
      endMin: Math.min(1440, Math.round(+t.endMin || 0)),
      capacity: Math.max(1, Math.round(+t.capacity || 1)),
      isActive: t.isActive !== false,
    }))
    saveM.mutate(templates)
  }

  const discard = () => {
    setTpl(withKeys(tplQ.data))
    setDirty(false)
  }

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Slots" sub="Weekly template grid & day passes" />

      {err && <ErrorBox>{err}</ErrorBox>}
      {!tpl && !err && <SkelList n={5} h={70} />}

      {tpl && (
        <>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[13px] text-label-2 flex-1">{tpl.length} slot{tpl.length === 1 ? '' : 's'} across the week</span>
            {dirty && (
              <button onClick={discard} className="text-[13px] text-label-3 no-tap">Discard</button>
            )}
            <BusyBtn busy={saveM.isPending} icon="check" size="sm" disabled={!dirty} onClick={save}>Save</BusyBtn>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {DAY_LABELS.map((label, wd) => {
              const daySlots = tpl.filter(t => t.weekday === wd).sort((a, b) => a.startMin - b.startMin)
              return (
                <div key={wd}>
                  <div className="flex items-center justify-between px-1 pb-[6px]">
                    <span className="text-[13px] text-label-2">{label}</span>
                    <button onClick={() => addSlot(wd)} aria-label={'Add slot on ' + label}
                      className="w-7 h-7 rounded-full bg-surface text-acc flex items-center justify-center no-tap active:bg-surface-2">
                      <Icon name="plus" className="text-[14px] [--icon-stroke:2.4]" />
                    </button>
                  </div>
                  <div className="bg-surface rounded-[14px] overflow-hidden min-h-[46px]">
                    {daySlots.length === 0 && (
                      <div className="px-3.5 py-3 text-[12.5px] text-label-3">Rest day — no slots.</div>
                    )}
                    {daySlots.map(s => {
                      const badRange = s.endMin <= s.startMin
                      return (
                        <div key={s._key} className={'lrow flex items-center gap-1.5 px-2 py-2' + (!s.isActive ? ' opacity-50' : '')}>
                          <input value={s.name} onChange={e => update(s._key, { name: e.target.value })} placeholder="Name"
                            className="flex-1 min-w-[84px] bg-transparent outline-none border-0 text-[14px] focus:shadow-[inset_0_0_0_2px_var(--acc)] rounded-md px-1.5 py-1" />
                          <TimeField value={s.startMin} onChange={v => update(s._key, { startMin: v })} />
                          <span className="text-label-3 text-[11px] shrink-0">–</span>
                          <TimeField value={s.endMin} onChange={v => update(s._key, { endMin: v })}
                            className={badRange ? 'shadow-[inset_0_0_0_2px_var(--red)]' : ''} />
                          <input type="number" min={1} value={s.capacity}
                            onChange={e => update(s._key, { capacity: +e.target.value || 0 })} title="Capacity"
                            className="w-[48px] bg-surface-2 rounded-lg px-1.5 py-[7px] text-[13px] text-center outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)] [appearance:textfield] shrink-0" />
                          <Switch checked={s.isActive !== false} onChange={v => update(s._key, { isActive: v })} />
                          <button onClick={() => remove(s._key)} aria-label="Remove"
                            className="w-7 h-7 rounded-lg text-red flex items-center justify-center no-tap shrink-0 active:bg-surface-2">
                            <Icon name="trash" className="text-[13px]" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-[12.5px] text-label-3 px-1 mt-2 leading-[1.45]">
            Saving replaces the whole weekly grid and regenerates bookable instances for future dates only —
            today’s bookings are never touched.
          </p>
        </>
      )}

      <DayPassPanel />
    </div>
  )
}

/* ---------------- day pass ---------------- */

function DayPassPanel() {
  const qc = useQueryClient()
  const today = todayISO()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [issued, setIssued] = useState(null)

  const passesQ = useQuery({
    queryKey: ['admin', 'daypass', today],
    queryFn: () => api('/api/admin/daypass?date=' + today),
    refetchInterval: 30_000,
  })
  const passes = passesQ.isError ? [] : passesQ.data

  const issueM = useMutation({
    mutationFn: body => api('/api/admin/daypass', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: r => {
      setIssued(r.code)
      setName('')
      setPhone('')
      qc.invalidateQueries({ queryKey: ['admin', 'daypass'] })
    },
    onError: e => toast(errText(e)),
  })

  const issue = () => issueM.mutate({ name: name.trim(), phone: phone.trim() || null })

  return (
    <section className="mt-6">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Day pass · today ({fmtDate(today)})</h2>
      <div className="bg-surface rounded-[14px] p-4">
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <TextField value={name} onChange={e => setName(e.target.value)} placeholder="Walk-in name" className="!py-[10px] !text-[15px]" />
          <TextField value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" className="!py-[10px] !text-[15px] sm:max-w-[180px]" />
          <BusyBtn busy={issueM.isPending} icon="plus" disabled={!name.trim()} onClick={issue} className="sm:w-auto sm:px-6 sm:self-stretch">Issue</BusyBtn>
        </div>

        {issued && (
          <button onClick={() => copyText(issued)}
            className="w-full flex items-center justify-center gap-3 rounded-xl py-3.5 mb-3 no-tap transition-transform active:scale-[.985]"
            style={{ background: 'color-mix(in srgb, var(--acc) 10%, transparent)' }}>
            <span className="font-mono font-bold tracking-[.28em] text-[26px] pl-[.28em]" style={{ color: 'var(--acc)' }}>{issued}</span>
            <Icon name="clipboard" className="text-[17px]" />
          </button>
        )}

        {!passes ? (
          <SkelList n={2} h={44} />
        ) : passes.length === 0 ? (
          <div className="text-[13px] text-label-3 py-2 px-1">No day passes sold today.</div>
        ) : (
          <div className="bg-surface-2/40 rounded-xl overflow-hidden -mx-1">
            {passes.map(p => (
              <div key={p.id} className="lrow flex items-center gap-3 px-3 py-2 min-h-[44px]">
                <Pill tone="teal">{p.code}</Pill>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] leading-tight truncate">{p.name}</span>
                  {p.phone && <span className="block text-[12px] text-label-2">{p.phone}</span>}
                </span>
                <span className="text-[12px] text-label-3 tabular-nums">
                  {p.checkedInAt ? hhmm(new Date(p.checkedInAt).getHours() * 60 + new Date(p.checkedInAt).getMinutes()) : ''}
                </span>
                {p.checkedInAt
                  ? <Icon name="checkCircle" className="text-green text-[17px]" />
                  : <Icon name="clock" className="text-label-3 text-[16px]" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

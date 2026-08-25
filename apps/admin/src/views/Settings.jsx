import { useEffect, useState } from 'react'
import { api } from '@og/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@og/ui'
import { fmtDateTime } from '../lib/format.js'
import {
  PageHead, Empty, SkelList, BusyBtn, Segmented, TextArea,
  TextField, NumberField, TimeField, ErrorBox, Pager, errText, toast,
} from '../components/bits.jsx'

const AUDIENCES = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING', label: 'Expiring' },
  { value: 'LAPSED', label: 'Lapsed' },
]

const NUMERIC = [
  ['bookingWindowDays', 'Booking window (days)', 1],
  ['cancelCutoffMin', 'Cancel cutoff (min before slot)', 1],
  ['graceCancelPerMonth', 'Grace cancels / month', 1],
  ['freezeMaxDays', 'Max freeze (days)', 1],
  ['freezeMaxPerYear', 'Max freezes / year', 1],
]

export default function Settings() {
  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Settings" sub="Gym rules, announcements and data" />
      <GymForm />
      <Announcer />
      <Exports />
      <AuditLog />
    </div>
  )
}

/* ---------------- gym settings ---------------- */

function GymForm() {
  const qc = useQueryClient()
  const [d, setD] = useState(null)
  const set = patch => setD(prev => ({ ...prev, ...patch }))

  const settingsQ = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api('/api/admin/settings'),
  })
  useEffect(() => {
    if (settingsQ.data) setD(settingsQ.data)
  }, [settingsQ.data])

  const err = settingsQ.isError ? errText(settingsQ.error) : null

  const saveM = useMutation({
    mutationFn: body => api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: saved => {
      setD({ ...saved, dayPassRs: saved.dayPassPricePaise / 100 })
      toast('Settings saved')
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
    },
    onError: e => toast(errText(e)),
  })

  const save = () => {
    if (!d) return
    const body = {
      gymName: d.gymName?.trim() || 'openGym',
      openMin: +d.openMin || 0,
      closeMin: Math.min(1440, +d.closeMin || 0),
      bookingWindowDays: Math.round(+d.bookingWindowDays || 1),
      cancelCutoffMin: Math.round(+d.cancelCutoffMin || 0),
      graceCancelPerMonth: Math.round(+d.graceCancelPerMonth || 0),
      freezeMaxDays: Math.round(+d.freezeMaxDays || 0),
      freezeMaxPerYear: Math.round(+d.freezeMaxPerYear || 0),
      dayPassPricePaise: Math.round((+d.dayPassRs || 0) * 100),
      noShowStrikes: Math.round(+d.noShowStrikes || 0),
    }
    if (body.closeMin <= body.openMin) {
      toast('Closing time must be after opening time')
      return
    }
    saveM.mutate(body)
  }

  if (err) return <ErrorBox>{err}</ErrorBox>
  if (!d) return <div className="mb-4"><SkelList n={3} h={64} /></div>

  return (
    <section className="mb-5">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Gym</h2>
      <div className="bg-surface rounded-[14px] p-4">
        <label className="block mb-3">
          <span className="block text-[13px] text-label-2 pb-[6px] px-1">Gym name</span>
          <TextField value={d.gymName ?? ''} onChange={e => set({ gymName: e.target.value })} placeholder="openGym" />
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <span className="block text-[13px] text-label-2 pb-[6px] px-1">Opens</span>
            <div className="flex items-center justify-center bg-surface-2 rounded-xl h-[46px]">
              <TimeField value={+d.openMin || 0} onChange={v => set({ openMin: v })} className="!w-[84px] !text-[15px]" />
            </div>
          </div>
          <div>
            <span className="block text-[13px] text-label-2 pb-[6px] px-1">Closes</span>
            <div className="flex items-center justify-center bg-surface-2 rounded-xl h-[46px]">
              <TimeField value={+d.closeMin || 0} onChange={v => set({ closeMin: v })} className="!w-[84px] !text-[15px]" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 desk:grid-cols-3 gap-x-4 gap-y-2.5">
          {NUMERIC.map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-[12.5px] text-label-2 pb-[4px] px-1 truncate">{label}</span>
              <div className="bg-surface-2 rounded-xl h-[42px] flex items-center pr-2">
                <NumberField value={+d[key] || 0} decimal={false} onChange={v => set({ [key]: v })} className="!text-[15px]" />
              </div>
            </label>
          ))}
          <label className="block">
            <span className="block text-[12.5px] text-label-2 pb-[4px] px-1">Day-pass price ₹</span>
            <div className="flex items-center bg-surface-2 rounded-xl h-[42px] pr-2">
              <span className="pl-2.5 text-[13px] text-label-3 shrink-0">₹</span>
              <NumberField value={+(d.dayPassRs ?? (d.dayPassPricePaise || 0) / 100)} decimal onChange={v => set({ dayPassRs: v })} className="!text-[15px]" />
            </div>
          </label>
          <label className="block">
            <span className="block text-[12.5px] text-label-2 pb-[4px] px-1">No-show strikes</span>
            <div className="bg-surface-2 rounded-xl h-[42px] flex items-center">
              <NumberField value={+d.noShowStrikes || 0} decimal={false} nullable onChange={v => set({ noShowStrikes: v ?? 0 })} className="!text-[15px]" />
            </div>
          </label>
        </div>
        <p className="text-[11.5px] text-label-3 px-1 mt-1.5">No-show strikes: 0 = track only.</p>

        <div className="mt-3 max-w-[280px] mx-auto desk:mx-0 desk:max-w-none desk:flex desk:justify-end">
          <BusyBtn busy={saveM.isPending} icon="check" onClick={save} className="desk:w-auto desk:px-10">Save settings</BusyBtn>
        </div>
      </div>
    </section>
  )
}

/* ---------------- announcements ---------------- */

function Announcer() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('ALL')
  const [result, setResult] = useState(null)

  const sendM = useMutation({
    mutationFn: payload => api('/api/admin/announcements', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: r => {
      const n = r.announcement?.sentCount ?? r.userIds?.length ?? 0
      setResult(n)
      setTitle('')
      setBody('')
      toast(`Sent to ${n} member${n === 1 ? '' : 's'}`)
      qc.invalidateQueries({ queryKey: ['admin', 'audit'] })
    },
    onError: e => toast(errText(e)),
  })

  const send = () => sendM.mutate({ title: title.trim(), body: body.trim(), audience })

  return (
    <section className="mb-5">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Announcement</h2>
      <div className="bg-surface rounded-[14px] p-4">
        <Segmented options={AUDIENCES} value={audience} onChange={setAudience} className="mb-3" />
        <TextField value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="!py-[10px] !text-[15px] mb-2" />
        <TextArea value={body} onChange={e => setBody(e.target.value)} placeholder="What should members know?" className="!min-h-[72px] !text-[15px] !bg-transparent !shadow-none border border-sep-op focus:border-acc" />
        <div className="flex items-center gap-3 mt-3">
          <span className="text-[12.5px] text-label-3 flex-1 min-w-0 truncate">
            {result != null ? `Last blast reached ${result} member${result === 1 ? '' : 's'}.` : 'Delivered as an in-app notification.'}
          </span>
          <BusyBtn busy={sendM.isPending} icon="bell" size="sm" disabled={!title.trim() || !body.trim()} onClick={send}>Send</BusyBtn>
        </div>
      </div>
    </section>
  )
}

/* ---------------- exports ---------------- */

function Exports() {
  const files = [
    ['members.csv', 'Members', 'person'],
    ['payments.csv', 'Payments', 'chartLine'],
    ['attendance.csv', 'Attendance', 'calendar'],
  ]
  return (
    <section className="mb-5">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Export CSV</h2>
      <div className="bg-surface rounded-[14px] overflow-hidden">
        {files.map(([file, label, icon]) => (
          <a key={file} href={'/api/admin/export/' + file} download
            className="lrow flex items-center gap-3 px-3.5 py-[11px] min-h-[46px] no-tap active:bg-surface-2">
            <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[16px] flex items-center justify-center bg-acc-soft text-acc"><Icon name={icon} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15.5px] leading-tight">{label}</span>
              <span className="block text-[12px] text-label-3">{file}</span>
            </span>
            <Icon name="download" className="text-label-2 text-[17px]" />
          </a>
        ))}
      </div>
    </section>
  )
}

/* ---------------- audit log ---------------- */

const AUDIT_PAGE = 15

function AuditLog() {
  const [page, setPage] = useState(1)
  const auditQ = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => api(`/api/admin/audit?page=${page}&pageSize=${AUDIT_PAGE}`),
  })
  const data = auditQ.isError ? { rows: [], total: 0 } : auditQ.data

  return (
    <section className="mb-5">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Audit log{data ? ` · ${data.total}` : ''}</h2>
      <div className="bg-surface rounded-[14px] overflow-hidden">
        {!data && <SkelList n={6} h={44} />}
        {data?.rows.length === 0 && <Empty icon="history" title="Nothing logged yet" hint="Admin actions are recorded here." />}
        {data?.rows.map(r => (
          <div key={r.id} className="lrow flex items-baseline gap-2.5 px-3.5 py-2 min-h-[44px]">
            <Icon name="history" className="text-[14px] text-label-3 self-center shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] leading-[1.35]">
              <b className="font-semibold">{prettyAction(r.action)}</b>
              {r.targetType && <span className="text-label-3"> · {r.targetType} #{String(r.targetId).slice(0, 8)}</span>}
            </span>
            <span className="hidden sm:block text-[12px] text-label-2 whitespace-nowrap">{r.actorName || 'system'}</span>
            <span className="text-[11.5px] text-label-3 whitespace-nowrap tabular-nums">{fmtDateTime(r.createdAt)}</span>
          </div>
        ))}
      </div>
      {data && <Pager page={page} pageSize={AUDIT_PAGE} total={data.total} onPage={setPage} />}
    </section>
  )
}

const prettyAction = a =>
  String(a || '')
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

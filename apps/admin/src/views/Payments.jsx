import { useEffect, useState } from 'react'
import { api } from '@og/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@og/ui'
import { fmtDate, fmtDateTime, inr } from '../lib/format.js'
import {
  PageHead, Empty, SkelList, BusyBtn, Avatar, Pill, Modal, ConfirmModal, Pager,
  SearchField, TextArea, NumberField, ErrorBox, Chip,
  PAY_STATUS_TONE, METHOD_TONE, errText, toast,
} from '../components/bits.jsx'

const PAGE = 25
const STATUSES = ['ALL', 'CREATED', 'PAID', 'FAILED', 'REFUNDED']
const METHODS = ['ALL', 'ONLINE', 'CASH', 'CARD_POS', 'DAY_PASS']
const MONTH_SEG = [
  { key: 'onlinePaise', tone: 'var(--blue)', label: 'Online' },
  { key: 'cashPaise', tone: 'var(--green)', label: 'Cash' },
  { key: 'cardPaise', tone: 'var(--purple)', label: 'Card' },
]

export default function Payments() {
  const [status, setStatus] = useState('ALL')
  const [method, setMethod] = useState('ALL')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [openRow, setOpenRow] = useState(null)
  const [recordOpen, setRecordOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [qInput])

  const normStatus = status === 'ALL' ? undefined : status
  const normMethod = method === 'ALL' ? undefined : method
  const ledgerQ = useQuery({
    queryKey: ['admin', 'payments', { status: normStatus, method: normMethod, q: q || undefined, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) })
      if (normStatus) params.set('status', normStatus)
      if (normMethod) params.set('method', normMethod)
      if (q) params.set('q', q)
      return api('/api/admin/payments?' + params)
    },
    placeholderData: keepPreviousData,
  })
  const data = ledgerQ.data
  const err = ledgerQ.isError ? errText(ledgerQ.error) : null

  const rows = data?.rows || []

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Payments" right={
        <BusyBtn icon="plus" size="sm" onClick={() => setRecordOpen(true)}>Record payment</BusyBtn>
      } sub={data ? `${data.total} payment${data.total === 1 ? '' : 's'}` : 'All money in and out'} />

      <div className="mb-2">
        <SearchField value={qInput} onChange={e => setQInput(e.target.value)} onClear={() => { setQInput(''); setQ('') }} placeholder="Search member email, order id, UTR" />
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {STATUSES.map(s => <Chip key={s} on={status === s} onClick={() => { setStatus(s); setPage(1) }}>{s === 'ALL' ? 'All statuses' : s}</Chip>)}
        <span className="w-px bg-sep-op mx-0.5" />
        {METHODS.map(m => <Chip key={m} on={method === m} onClick={() => { setMethod(m); setPage(1) }}>{m === 'ALL' ? 'All methods' : m.replace('_', ' ')}</Chip>)}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}

      {!data && !err && <SkelList n={6} h={54} />}

      {data && (rows.length === 0 ? (
        <Empty icon="clipboard" title="No payments found" hint="Try clearing the filters or record a manual payment." />
      ) : (
        <>
          <div className="bg-surface rounded-[14px] overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px] text-[13.5px]">
              <thead>
                <tr className="text-left text-label-2 font-normal text-[12px]">
                  <th className="px-3.5 py-2.5">Member</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">When</th>
                  <th className="px-3 py-2.5">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} onClick={() => setOpenRow(p)}
                    className="border-t border-sep-op cursor-pointer transition-colors hover:bg-surface-2 no-tap">
                    <td className="px-3.5 py-2 max-w-[200px]">
                      <span className="block truncate leading-[1.25]">{p.userName}</span>
                      <span className="block truncate text-[12px] text-label-2">{p.userEmail}</span>
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {inr(p.amountPaise)}{p.planName && <span className="text-[12px] text-label-3 font-normal"> · {p.planName}</span>}
                    </td>
                    <td className="px-3 py-2"><Pill tone={METHOD_TONE[p.method] || 'grey'}>{p.method.replace('_', ' ')}</Pill></td>
                    <td className="px-3 py-2">
                      <Pill tone={PAY_STATUS_TONE[p.status] || 'grey'}>{p.status}</Pill>
                      {p.disputeNote && <Icon name="info" className="inline text-[13px] text-orange ml-1 align-[-2px]" />}
                    </td>
                    <td className="px-3 py-2 text-label-2 whitespace-nowrap">{fmtDate(p.paidAt || p.createdAt)}</td>
                    <td className="px-3 py-2 max-w-[150px]"><span className="block truncate text-[12px] text-label-3 font-mono">{p.razorpayPaymentId || p.utr || p.razorpayOrderId || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE} total={data?.total || 0} onPage={setPage} />
        </>
      ))}

      {openRow && <PaymentModal p={openRow} onClose={() => setOpenRow(null)} />}

      {recordOpen && <RecordModal onClose={() => setRecordOpen(false)} onDone={() => { setRecordOpen(false); setPage(1) }} />}

      <RevenueSection />
    </div>
  )
}

/* ---------------- row actions modal ---------------- */

function PaymentModal({ p, onClose }) {
  const qc = useQueryClient()
  const [utr, setUtr] = useState(p.utr || '')
  const [note, setNote] = useState('')
  const [confirmRefund, setConfirmRefund] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'payments'] })
    qc.invalidateQueries({ queryKey: ['admin', 'revenue'] })
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
  }
  const done = label => () => { toast(label + ' done'); invalidate(); onClose() }

  const utrM = useMutation({
    mutationFn: body => api('/api/admin/payments/match-utr', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: done('UTR'),
    onError: e => toast(errText(e)),
  })
  const disputeM = useMutation({
    mutationFn: body => api(`/api/admin/payments/${p.id}/dispute`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: done('Dispute'),
    onError: e => toast(errText(e)),
  })
  const resolveM = useMutation({
    mutationFn: body => api(`/api/admin/payments/${p.id}/resolve-dispute`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: done('Resolve'),
    onError: e => toast(errText(e)),
  })
  const refundM = useMutation({
    mutationFn: body => api(`/api/admin/payments/${p.id}/refund-mark`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { toast('Refund done'); invalidate(); setConfirmRefund(false); onClose() },
    onError: e => toast(errText(e)),
  })

  return (
    <>
      <Modal title={`Payment · ${inr(p.amountPaise)}`} onClose={onClose}>
        <div className="bg-surface rounded-xl px-4 py-3 mb-4 text-[14px]">
          <div className="flex justify-between gap-3 py-0.5"><span className="text-label-2">Member</span><span className="truncate">{p.userName} · {p.userEmail}</span></div>
          <div className="flex justify-between gap-3 py-0.5"><span className="text-label-2">Method / status</span><span>{p.method.replace('_', ' ')} · {p.status}</span></div>
          {p.planName && <div className="flex justify-between gap-3 py-0.5"><span className="text-label-2">Plan</span><span>{p.planName}</span></div>}
          <div className="flex justify-between gap-3 py-0.5"><span className="text-label-2">Paid at</span><span>{fmtDateTime(p.paidAt)}</span></div>
          {p.razorpayOrderId && <div className="flex justify-between gap-3 py-0.5"><span className="text-label-2">Order</span><span className="font-mono text-[12px] truncate">{p.razorpayOrderId}</span></div>}
          {p.note && <div className="pt-1.5 mt-1.5 border-t border-sep-op text-label-2">Note: {p.note}</div>}
        </div>

        {p.disputeNote && (
          <div className="rounded-xl px-4 py-3 mb-4 text-[13.5px]"
            style={{ color: 'var(--orange)', background: 'color-mix(in srgb, var(--orange) 12%, transparent)' }}>
            <b>Dispute:</b> {p.disputeNote}
          </div>
        )}

        {p.method === 'ONLINE' && (
          <div className="mb-4">
            <div className="text-[13px] text-label-2 pb-[6px] px-1">Attach bank UTR</div>
            <div className="flex gap-2">
              <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="UTR reference"
                className="flex-1 min-w-0 bg-surface rounded-xl px-[15px] py-[11px] text-[15px] outline-none border-0 focus:shadow-[inset_0_0_0_2px_var(--acc)]" />
              <BusyBtn busy={utrM.isPending} size="sm" variant="surface" disabled={!utr.trim() || utr === p.utr}
                onClick={() => utrM.mutate({ paymentId: p.id, utr: utr.trim() })}>
                Save
              </BusyBtn>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-[13px] text-label-2 pb-[6px] px-1">Dispute note {p.disputeNote ? '(resolve note optional)' : ''}</div>
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="What happened?" className="!min-h-[64px] !text-[15px]" />
          <div className="flex gap-2 mt-2">
            {!p.disputeNote && (
              <BusyBtn busy={disputeM.isPending} size="sm" variant="danger" disabled={!note.trim()}
                onClick={() => disputeM.mutate({ note: note.trim() })}>
                Flag dispute
              </BusyBtn>
            )}
            {p.disputeNote && (
              <BusyBtn busy={resolveM.isPending} size="sm" variant="tinted"
                onClick={() => resolveM.mutate(note.trim() ? { note: note.trim() } : {})}>
                Resolve dispute
              </BusyBtn>
            )}
          </div>
        </div>

        {p.status !== 'REFUNDED' && (
          <BusyBtn busy={refundM.isPending} variant="danger" icon="reset"
            onClick={() => setConfirmRefund(true)}>
            Mark refunded
          </BusyBtn>
        )}
      </Modal>

      {confirmRefund && (
        <ConfirmModal
          title="Mark as refunded?"
          message={`${inr(p.amountPaise)} from ${p.userName} will be marked REFUNDED and any membership it started is cut back to today. This cannot be undone.`}
          confirmText="Mark refunded" danger busy={refundM.isPending}
          onConfirm={() => refundM.mutate(note.trim() ? { note: note.trim() } : {})}
          onClose={() => setConfirmRefund(false)} />
      )}
    </>
  )
}

/* ---------------- record payment modal ---------------- */

function RecordModal({ onClose, onDone }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [picked, setPicked] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [method, setMethod] = useState('CASH')
  const [customRs, setCustomRs] = useState(0)
  const [note, setNote] = useState('')

  const plansQ = useQuery({
    queryKey: ['admin', 'plans', 'active'],
    queryFn: () => api('/api/plans'),
  })
  const plans = plansQ.isError
    ? []
    : plansQ.data
      ? (Array.isArray(plansQ.data) ? plansQ.data : []).filter(x => x.isActive !== false)
      : null

  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const searchQ = useQuery({
    queryKey: ['admin', 'users', { q: dq }],
    queryFn: () => api('/api/admin/users?q=' + encodeURIComponent(dq) + '&pageSize=8'),
    enabled: !!dq,
    placeholderData: keepPreviousData,
  })
  const results = dq ? searchQ.data?.rows || [] : []
  const searching = searchQ.isFetching

  const plan = plans?.find(x => x.id === planId) || null
  const amountPaise = customRs > 0 ? Math.round(customRs * 100) : plan ? plan.pricePaise : null
  const canSave = picked && amountPaise > 0

  const saveM = useMutation({
    mutationFn: body => api('/api/admin/payments/manual', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast(`Recorded ${inr(amountPaise)} for ${picked.name}`)
      qc.invalidateQueries({ queryKey: ['admin', 'payments'] })
      qc.invalidateQueries({ queryKey: ['admin', 'revenue'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
      onDone()
    },
    onError: e => toast(errText(e)),
  })

  const save = () => saveM.mutate({
    userId: picked.id,
    ...(planId ? { planId } : {}),
    method,
    ...(customRs > 0 ? { amountPaise } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
  })

  return (
    <Modal title="Record payment" onClose={onClose} wide>
      <div className="mb-4">
        <div className="text-[13px] text-label-2 pb-[6px] px-1">Member</div>
        {picked ? (
          <div className="flex items-center gap-2.5 bg-surface rounded-xl px-3 py-2.5">
            <Avatar name={picked.name} url={picked.avatarUrl} size={34} />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] leading-tight truncate">{picked.name}</span>
              <span className="block text-[12.5px] text-label-2 truncate">{picked.email}</span>
            </span>
            <button aria-label="Change member" onClick={() => { setPicked(null); setQ('') }}
              className="w-7 h-7 rounded-full bg-surface-2 text-label-2 flex items-center justify-center no-tap active:bg-surface-3">
              <Icon name="xmark" className="text-[12px]" />
            </button>
          </div>
        ) : (
          <>
            <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search name or email" />
            {(results.length > 0 || searching) && (
              <div className="mt-1.5 bg-surface rounded-xl overflow-hidden max-h-[210px] overflow-y-auto">
                {searching && results.length === 0 && <SkelList n={2} h={46} />}
                {results.map(u => (
                  <button key={u.id} onClick={() => { setPicked(u); setQ(''); setDq('') }}
                    className="lrow w-full flex items-center gap-2.5 px-3 py-2 text-left no-tap active:bg-surface-2">
                    <Avatar name={u.name} url={u.avatarUrl} size={30} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] leading-tight truncate">{u.name}</span>
                      <span className="block text-[12px] text-label-2 truncate">{u.email}</span>
                    </span>
                    <Pill tone={u.status === 'ACTIVE' ? 'green' : u.status === 'PENDING' ? 'orange' : 'red'}>{u.status}</Pill>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mb-4">
        <div className="text-[13px] text-label-2 pb-[6px] px-1">Plan <span className="text-label-3">(optional with custom amount)</span></div>
        <div className="bg-surface rounded-xl overflow-hidden max-h-[190px] overflow-y-auto">
          {plans === null && <SkelList n={3} h={44} />}
          {plans?.length === 0 && <div className="px-4 py-3 text-[13px] text-label-3">No active plans.</div>}
          {plans?.map(pl => (
            <button key={pl.id} onClick={() => setPlanId(planId === pl.id ? null : pl.id)}
              className="lrow w-full flex items-center gap-2.5 px-3.5 py-2 text-left no-tap active:bg-surface-2">
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] truncate">{pl.name}</span>
                <span className="block text-[12px] text-label-2">{inr(pl.pricePaise)} · {pl.durationDays} days</span>
              </span>
              {planId === pl.id && <Icon name="checkCircle" className="text-acc text-[18px]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-[13px] text-label-2 pb-[6px] px-1">Method</div>
          <div className="relative flex bg-seg-track rounded-[9px] p-[2px]">
            {['CASH', 'CARD_POS'].map(m => (
              <button key={m} onClick={() => setMethod(m)}
                className={'relative z-[1] flex-1 py-[7px] rounded-[7px] text-[13.5px] no-tap transition-opacity ' +
                  (method === m ? 'bg-surface font-medium text-label shadow-[0_3px_8px_rgba(0,0,0,.12)]' : 'text-label-2')}>
                {m === 'CASH' ? 'Cash' : 'Card POS'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[13px] text-label-2 pb-[6px] px-1">Custom ₹ <span className="text-label-3">(overrides plan)</span></div>
          <div className="flex items-center bg-surface-2 rounded-[10px] overflow-hidden h-[38px] pr-2">
            <span className="pl-3 text-[13px] text-label-3 shrink-0">₹</span>
            <NumberField value={customRs} decimal onChange={v => setCustomRs(Math.round(v * 100) / 100)} nullable className="!text-[15px]" />
            {customRs > 0 && (
              <button aria-label="Clear" onClick={() => setCustomRs(0)}
                className="w-[20px] h-[20px] rounded-full bg-label-3 text-bg flex items-center justify-center text-[10px] shrink-0 [--icon-stroke:3]">
                <Icon name="xmark" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-1">
        <div className="text-[13px] text-label-2 pb-[6px] px-1">Note</div>
        <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional context for the ledger" className="!min-h-[56px] !text-[15px]" />
      </div>

      <div className="flex items-center justify-between gap-3 mt-4">
        <div className="min-w-0">
          <span className="text-[12.5px] text-label-3">Amount</span>
          <div className="text-[19px] font-semibold tracking-[-.02em] truncate">{amountPaise ? inr(amountPaise) : '—'}</div>
        </div>
        <BusyBtn busy={saveM.isPending} icon="check" disabled={!canSave} onClick={save} className="w-auto px-8">Record</BusyBtn>
      </div>
    </Modal>
  )
}

/* ---------------- revenue section ---------------- */

function RevenueSection() {
  const revQ = useQuery({
    queryKey: ['admin', 'revenue'],
    queryFn: () => api('/api/admin/revenue?months=6'),
  })
  const rev = revQ.isError ? [] : revQ.data

  const maxTotal = rev?.length ? Math.max(...rev.map(r => r.totalPaise), 1) : 1

  return (
    <section className="mt-6">
      <h2 className="text-[13px] text-label-2 tracking-[-.004em] px-1 pb-[7px]">Revenue · last 6 months</h2>
      <div className="bg-surface rounded-[14px] p-4 overflow-x-auto">
        {!rev ? (
          <SkelList n={1} h={160} />
        ) : rev.length === 0 ? (
          <Empty icon="chart" title="No revenue yet" hint="Paid payments show up here grouped by month." />
        ) : (
          <>
            <div className="flex items-end gap-2 min-w-[420px] h-[150px]">
              {rev.map(m => (
                <div key={m.ym} className="flex-1 h-full flex flex-col justify-end items-stretch min-w-0" title={`${m.ym}: ${inr(m.totalPaise)} (${m.count})`}>
                  <div className="flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: Math.max(2, (m.totalPaise / maxTotal) * 100) + '%' }}>
                    {MONTH_SEG.map(seg => (
                      <div key={seg.key} style={{
                        height: m.totalPaise ? ((m[seg.key] / m.totalPaise) * 100) + '%' : '0%',
                        background: seg.tone,
                        opacity: m[seg.key] ? 1 : 0,
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 min-w-[420px] mt-1.5">
              {rev.map(m => (
                <div key={m.ym} className="flex-1 text-center text-[10.5px] text-label-3 tabular-nums truncate">{m.ym.slice(5)}/{m.ym.slice(2, 4)}</div>
              ))}
            </div>
            <div className="flex gap-4 mt-2.5 flex-wrap">
              {MONTH_SEG.map(s => (
                <span key={s.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-label-2">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: s.tone }} />{s.label}
                </span>
              ))}
            </div>

            <table className="w-full border-collapse mt-4 text-[12.5px] min-w-[420px]">
              <thead>
                <tr className="text-left text-label-3 text-[11px]">
                  <th className="py-1.5 pr-2">Month</th>
                  <th className="px-2 py-1.5 text-right">Online</th>
                  <th className="px-2 py-1.5 text-right">Cash</th>
                  <th className="px-2 py-1.5 text-right">Card</th>
                  <th className="px-2 py-1.5 text-right">Total</th>
                  <th className="pl-2 py-1.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {[...rev].reverse().map(m => (
                  <tr key={m.ym} className="border-t border-sep-op">
                    <td className="py-1.5 pr-2 text-label-2 whitespace-nowrap">{m.ym}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.onlinePaise ? inr(m.onlinePaise) : '·'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.cashPaise ? inr(m.cashPaise) : '·'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m.cardPaise ? inr(m.cardPaise) : '·'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{inr(m.totalPaise)}</td>
                    <td className="pl-2 py-1.5 text-right tabular-nums text-label-2">{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  )
}

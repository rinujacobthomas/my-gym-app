import { useState } from 'react'
import { api } from '@og/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from '@og/ui'
import { fmtDate } from '../lib/format.js'
import { PageHead, Empty, SkelList, BusyBtn, Avatar, ErrorBox, Pager, errText, toast } from '../components/bits.jsx'

const PAGE = 25

export default function Approvals() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState(() => new Set())

  const listQ = useQuery({
    queryKey: ['admin', 'users', 'PENDING', page],
    queryFn: () => api(`/api/admin/users?status=PENDING&page=${page}&pageSize=${PAGE}`),
    refetchInterval: 20_000,
    placeholderData: keepPreviousData,
  })
  const data = listQ.data
  const err = listQ.isError ? errText(listQ.error) : null

  const approveM = useMutation({
    mutationFn: ids => api('/api/admin/users/approve', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: r => {
      toast(`Approved ${r.count} member${r.count === 1 ? '' : 's'}`)
      setSel(new Set())
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
    },
    onError: e => toast(errText(e)),
  })
  const approve = ids => { if (ids.length) approveM.mutate(ids) }
  // Declining disables the account: it leaves the queue and that Google login can't get in.
  // It can be re-enabled later from Members.
  const declineM = useMutation({
    mutationFn: id => api('/api/admin/users/disable', { method: 'POST', body: JSON.stringify({ id, disabled: true }) }),
    onSuccess: () => {
      toast('Request declined')
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
    },
    onError: e => toast(errText(e)),
  })
  const rowBusy = id => approveM.isPending && approveM.variables?.length === 1 && approveM.variables[0] === id

  const rows = data?.rows || []
  const allSel = rows.length > 0 && rows.every(r => sel.has(r.id))

  const toggleAll = () => {
    setSel(prev => {
      const next = new Set(allSel ? [] : rows.map(r => r.id))
      return next
    })
  }
  const toggle = id => {
    setSel(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = data?.total ?? 0

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Approvals" sub={data ? `${total} pending request${total === 1 ? '' : 's'}` : 'New member requests'} />

      {err && !data && <ErrorBox>{err}</ErrorBox>}

      {!data && !err && <SkelList n={5} h={58} />}

      {data && (
        rows.length === 0 ? (
          <Empty icon="checkCircle" title="No pending approvals" hint="Everyone who signed up has been reviewed. New requests appear here automatically." />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2 bg-surface rounded-xl px-2.5 py-2">
              <Check checked={allSel} onChange={toggleAll} size={26} />
              <button onClick={toggleAll} className="text-[13.5px] text-label-2 flex-1 text-left no-tap">Select page</button>
              {sel.size > 0 && (
                <BusyBtn busy={approveM.isPending} icon="check" size="sm" variant="primary" onClick={() => approve([...sel])}>
                  Approve {sel.size}
                </BusyBtn>
              )}
            </div>

            <div className="bg-surface rounded-[14px] overflow-hidden">
              {rows.map(u => (
                <div key={u.id} className="lrow flex items-center gap-2.5 px-2.5 py-2 min-h-[58px]">
                  <Check checked={sel.has(u.id)} onChange={() => toggle(u.id)} size={26} />
                  <Avatar name={u.name} url={u.avatarUrl} size={38} />
                  <button onClick={() => toggle(u.id)} className="flex-1 min-w-0 text-left no-tap">
                    <div className="text-[15.5px] tracking-[-.012em] leading-[1.25] truncate">{u.name}</div>
                    <div className="text-[12.5px] text-label-2 truncate">{u.email}</div>
                  </button>
                  <span className="hidden desk:block text-[12px] text-label-3 shrink-0">{fmtDate(u.createdAt)}</span>
                  <BusyBtn busy={declineM.isPending && declineM.variables === u.id} size="xs" variant="ghost" className="text-red whitespace-nowrap"
                    onClick={() => { if (window.confirm('Decline ' + u.name + '? They will not be able to sign in. You can re-enable them later under Members.')) declineM.mutate(u.id) }}>
                    Decline
                  </BusyBtn>
                  <BusyBtn busy={rowBusy(u.id)} icon="check" size="xs" variant="tinted" className="whitespace-nowrap" onClick={() => approve([u.id])}>
                    Approve
                  </BusyBtn>
                </div>
              ))}
            </div>

            <Pager page={page} pageSize={PAGE} total={total} onPage={setPage} />
          </>
        )
      )}
    </div>
  )
}

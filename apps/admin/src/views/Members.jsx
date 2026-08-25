import { useEffect, useState } from 'react'
import { api } from '@og/api-client'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@og/ui'
import { fmtDate, fmtDateTime, inr } from '../lib/format.js'
import {
  PageHead, Empty, SkelList, BusyBtn, Avatar, Pill, Dropdown, ConfirmModal,
  Pager, SearchField, ErrorBox, USER_STATUS_TONE, PAY_STATUS_TONE, METHOD_TONE, errText, toast,
} from '../components/bits.jsx'

const PAGE = 25
const TABS = ['ALL', 'PENDING', 'ACTIVE', 'DISABLED']
const ROLES = ['MEMBER', 'TRAINER', 'STAFF', 'ADMIN']

export default function Members() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('ALL')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [confirmOff, setConfirmOff] = useState(null)
  const [drawerId, setDrawerId] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [qInput])

  const status = tab === 'ALL' ? undefined : tab
  const listQ = useQuery({
    queryKey: ['admin', 'users', { q: q || undefined, status, page }],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE) })
      if (status) params.set('status', status)
      if (q) params.set('q', q)
      return api('/api/admin/users?' + params)
    },
    placeholderData: keepPreviousData,
  })
  const data = listQ.data
  const err = listQ.isError ? errText(listQ.error) : null

  const rows = data?.rows || []
  const drawer = rows.find(r => r.id === drawerId) || null

  const invUsers = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })

  const approveM = useMutation({
    mutationFn: u => api('/api/admin/users/approve', { method: 'POST', body: JSON.stringify({ ids: [u.id] }) }),
    onSuccess: (_r, u) => {
      toast(`${u.name} approved`)
      invUsers()
      qc.invalidateQueries({ queryKey: ['admin', 'overview'] })
    },
    onError: e => toast(errText(e)),
  })

  const disableM = useMutation({
    mutationFn: v => api('/api/admin/users/disable', { method: 'POST', body: JSON.stringify({ id: v.id, disabled: v.disabled }) }),
    onSuccess: (_r, v) => {
      toast(v.disabled ? `${v.name} re-enabled` : `${v.name} disabled`)
      invUsers()
      setConfirmOff(null)
    },
    onError: e => toast(errText(e)),
  })

  const roleM = useMutation({
    mutationFn: v => api('/api/admin/users/role', { method: 'POST', body: JSON.stringify({ id: v.id, role: v.role }) }),
    onSuccess: (_r, v) => {
      toast(`${v.name} is now ${v.role.toLowerCase()}`)
      invUsers()
    },
    onError: e => { toast(errText(e)); invUsers() },
  })

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Members" sub={data ? `${data.total} ${tab === 'ALL' ? '' : tab.toLowerCase() + ' '}account${data.total === 1 ? '' : 's'}` : 'Search and manage accounts'} />

      <div className="mb-2">
        <SearchField value={qInput} onChange={e => setQInput(e.target.value)} onClear={() => { setQInput(''); setQ('') }} placeholder="Search name or email" />
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setPage(1) }}
            className={'shrink-0 rounded-full px-3.5 py-[7px] text-[13px] font-medium no-tap transition-colors ' +
              (t === tab ? 'bg-acc text-on-acc' : 'bg-surface text-label-2')}>
            {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {err && <ErrorBox>{err}</ErrorBox>}

      {listQ.isPending && !err && <SkelList n={6} h={56} />}

      {data && rows.length === 0 ? (
        <Empty icon="person" title="No members found" hint={q ? `Nothing matches “${q}”.` : 'No accounts with this status yet.'} />
      ) : data && (
        <>
          <div className="bg-surface rounded-[14px] overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="text-left text-label-2 font-normal text-[12px]">
                  <th className="px-3.5 py-2.5">Member</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="px-3 py-2.5">Membership</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(u => {
                  const off = u.status === 'DISABLED'
                  return (
                    <tr key={u.id} className={'border-t border-sep-op ' + (off ? 'opacity-50' : '')}>
                      <td className="px-3.5 py-2 max-w-[240px]">
                        <button onClick={() => setDrawerId(u.id)} className="flex items-center gap-2.5 min-w-0 text-left w-full no-tap">
                          <Avatar name={u.name} url={u.avatarUrl} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate leading-[1.25]">{u.name}</span>
                            <span className="block truncate text-[12px] text-label-2">{u.email}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2"><Pill tone={USER_STATUS_TONE[u.status] || 'grey'}>{u.status}</Pill></td>
                      <td className="px-3 py-2">
                        <Dropdown value={u.role} options={ROLES.map(r => ({ value: r, label: r }))} onChange={v => roleM.mutate({ ...u, role: v })} />
                      </td>
                      <td className="px-3 py-2 text-label-2 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {u.membershipEnd
                          ? <span className="text-label-2">{fmtDate(u.membershipEnd)} {u.membershipStatus && <Pill tone={u.membershipStatus === 'ACTIVE' ? 'green' : u.membershipStatus === 'EXPIRING' ? 'yellow' : 'grey'}>{u.membershipStatus}</Pill>}</span>
                          : <span className="text-label-3">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.status === 'PENDING' && (
                            <BusyBtn busy={approveM.isPending && approveM.variables?.id === u.id} icon="check" size="xs" variant="tinted" onClick={() => approveM.mutate(u)}>Approve</BusyBtn>
                          )}
                          {off
                            ? <BusyBtn busy={disableM.isPending && disableM.variables?.id === u.id} size="xs" variant="tinted" onClick={() => disableM.mutate({ ...u, disabled: false })}>Enable</BusyBtn>
                            : <BusyBtn busy={disableM.isPending && disableM.variables?.id === u.id} size="xs" variant="danger" onClick={() => setConfirmOff(u)}>Disable</BusyBtn>}
                          <button onClick={() => setDrawerId(u.id)} aria-label="Details"
                            className="w-7 h-7 rounded-lg bg-surface-2 text-label-2 flex items-center justify-center no-tap active:bg-surface-3">
                            <Icon name="chevronRight" className="text-[12px] [--icon-stroke:2.4]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={PAGE} total={data?.total || 0} onPage={setPage} />
        </>
      )}

      {drawer && <MemberDrawer u={drawer} onClose={() => setDrawerId(null)} />}

      {confirmOff && (
        <ConfirmModal
          title={`Disable ${confirmOff.name}?`}
          message="Their sessions are signed out immediately and upcoming slot bookings are cancelled. You can re-enable the account any time."
          confirmText="Disable" danger busy={disableM.isPending && disableM.variables?.id === confirmOff.id}
          onConfirm={() => disableM.mutate({ ...confirmOff, disabled: true })}
          onClose={() => setConfirmOff(null)} />
      )}
    </div>
  )
}

function MemberDrawer({ u, onClose }) {
  const paysQ = useQuery({
    queryKey: ['admin', 'payments', { email: u.email }],
    queryFn: () => api('/api/admin/payments?q=' + encodeURIComponent(u.email) + '&pageSize=20'),
  })
  const pays = paysQ.data?.rows || []

  return (
    <>
      <div className="fixed inset-0 z-[105] bg-black/50 desk:bg-black/35" onClick={onClose} />
      <aside className="fixed z-[110] inset-y-0 right-0 w-full desk:w-[440px] bg-bg-el border-l-[0.5px] border-sep overflow-y-auto animate-[drawer_.22s_var(--ease)] shadow-[0_0_60px_rgba(0,0,0,.5)]">
        <div className="sticky top-0 bg-bg-el/95 backdrop-blur flex items-center gap-3 px-4 py-3 border-b-[0.5px] border-sep z-10">
          <Avatar name={u.name} url={u.avatarUrl} size={40} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold tracking-[-.02em] truncate leading-tight">{u.name}</div>
            <div className="text-[13px] text-label-2 truncate">{u.email}</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-[30px] h-[30px] rounded-full shrink-0 bg-surface-2 text-label-2 flex items-center justify-center no-tap active:bg-surface-3">
            <Icon name="xmark" />
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Fact label="Status"><Pill tone={USER_STATUS_TONE[u.status] || 'grey'}>{u.status}</Pill></Fact>
            <Fact label="Role">{u.role}</Fact>
            <Fact label="Joined">{fmtDate(u.createdAt)}</Fact>
            <Fact label="Membership ends">{u.membershipEnd ? fmtDate(u.membershipEnd) : '—'}</Fact>
          </div>

          <h3 className="text-[13px] text-label-2 px-1 pb-[7px]">Payments · {u.email}</h3>
          <div className="bg-surface rounded-[14px] overflow-hidden">
            {paysQ.isPending && <SkelList n={3} h={54} />}
            {paysQ.isError && <div className="p-4 text-[13px] text-red">{errText(paysQ.error)}</div>}
            {paysQ.isSuccess && pays.length === 0 && (
              <Empty icon="clipboard" title="No payments" hint="Nothing recorded for this email yet." />
            )}
            {paysQ.isSuccess && pays.map(p => (
              <div key={p.id} className="lrow flex items-center gap-3 px-3.5 py-[11px] min-h-[52px]">
                <span className={'w-[29px] h-[29px] rounded-[7px] shrink-0 text-[15px] flex items-center justify-center'}
                  style={{ color: `var(--${METHOD_TONE[p.method] || 'grey'})`, background: `color-mix(in srgb, var(--${METHOD_TONE[p.method] || 'grey'}) 14%, transparent)` }}>
                  <Icon name="chartLine" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] leading-[1.25]">{inr(p.amountPaise)}{p.planName ? <span className="text-label-2 text-[13px]"> · {p.planName}</span> : null}</span>
                  <span className="block text-[12px] text-label-3 truncate">{fmtDateTime(p.paidAt || p.createdAt)}</span>
                </span>
                <Pill tone={PAY_STATUS_TONE[p.status] || 'grey'}>{p.status}</Pill>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}

function Fact({ label, children }) {
  return (
    <div className="bg-surface rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-[11.5px] text-label-3 truncate">{label}</div>
      <div className="text-[14px] mt-[2px] truncate">{children}</div>
    </div>
  )
}

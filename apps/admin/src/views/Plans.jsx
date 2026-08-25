import { useState } from 'react'
import { api, ApiError, qk } from '@og/api-client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '@og/ui'
import { Switch } from '@og/ui'
import { inr } from '../lib/format.js'
import {
  PageHead, Empty, SkelList, BusyBtn, Modal, ConfirmModal,
  TextField, NumberField, TextArea, ErrorBox, errText, toast,
} from '../components/bits.jsx'

const BLANK = { name: '', pricePaise: 0, durationDays: 30, description: '', sortOrder: 0, isActive: true }

export default function Plans() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [hint409, setHint409] = useState(null)

  const plansQ = useQuery({
    queryKey: qk.plans,
    queryFn: () => api('/api/admin/plans'),
  })
  const rows = plansQ.data
  const err = plansQ.isError ? errText(plansQ.error) : null

  const toggleM = useMutation({
    mutationFn: v => api('/api/admin/plans/' + v.p.id, { method: 'PATCH', body: JSON.stringify({ isActive: v.isActive }) }),
    onSuccess: (_r, v) => toast(v.isActive ? `${v.p.name} active` : `${v.p.name} hidden`),
    onError: e => toast(errText(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.plans }),
  })
  const rowBusy = id => toggleM.isPending && toggleM.variables?.p?.id === id

  const deleteM = useMutation({
    mutationFn: p => api('/api/admin/plans/' + p.id, { method: 'DELETE' }),
    onSuccess: (_r, p) => {
      toast(`${p.name} deleted`)
      setDeleting(null)
      qc.invalidateQueries({ queryKey: qk.plans })
    },
    onError: (e, p) => {
      setDeleting(null)
      if (e instanceof ApiError && e.status === 409) {
        setHint409(p.id)
        toast('In use — deactivate instead')
      } else {
        toast(errText(e))
      }
    },
  })

  return (
    <div className="animate-[viewfade_.25s_var(--ease)]">
      <PageHead title="Plans" sub={rows ? `${rows.length} plan${rows.length === 1 ? '' : 's'}` : 'Membership pricing'} right={
        <BusyBtn icon="plus" size="sm" onClick={() => setEditing({ ...BLANK })}>New plan</BusyBtn>
      } />

      {err && <ErrorBox>{err}</ErrorBox>}
      {!rows && !err && <SkelList n={4} h={62} />}

      {rows?.length === 0 && (
        <Empty icon="list" title="No plans yet" hint="Create your first membership plan to start selling." />
      )}

      {rows?.length > 0 && (
        <div className="bg-surface rounded-[14px] overflow-hidden">
          {rows.map(p => (
            <div key={p.id} className={'lrow px-3.5 py-3 min-h-[64px]' + (p.isActive === false ? ' opacity-55' : '')}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] tracking-[-.012em] leading-[1.25] truncate">{p.name}</div>
                  <div className="text-[13px] text-label-2 truncate">
                    {inr(p.pricePaise)} · {p.durationDays} days{p.description ? ` — ${p.description}` : ''}
                  </div>
                </div>
                <button aria-label="Edit" onClick={() => setEditing({ ...p })}
                  className="w-8 h-8 rounded-lg bg-surface-2 text-label-2 flex items-center justify-center no-tap shrink-0 active:bg-surface-3">
                  <Icon name="pencil" className="text-[14px]" />
                </button>
                <button aria-label="Delete" onClick={() => setDeleting(p)}
                  className="w-8 h-8 rounded-lg bg-[color-mix(in_srgb,var(--red)_13%,transparent)] text-red flex items-center justify-center no-tap shrink-0">
                  <Icon name="trash" className="text-[14px]" />
                </button>
                <Switch checked={p.isActive !== false} onChange={v => toggleM.mutate({ p, isActive: v })} disabled={rowBusy(p.id)} />
              </div>
              {hint409 === p.id && (
                <button onClick={() => { setHint409(null); setEditing({ ...p }) }}
                  className="mt-1.5 text-[12px] font-medium"
                  style={{ color: 'var(--orange)' }}>
                  This plan has memberships or payments attached — deactivate instead of deleting. Tap to edit.
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && <PlanEditor draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setHint409(null) }} />}

      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          message="This permanently removes the plan. Plans already attached to memberships or payments cannot be deleted."
          confirmText="Delete" danger onConfirm={() => deleteM.mutate(deleting)} onClose={() => setDeleting(null)} />
      )}
    </div>
  )
}

function PlanEditor({ draft, onClose, onSaved }) {
  const qc = useQueryClient()
  const isNew = !draft.id
  const [d, setD] = useState(draft)
  const set = patch => setD(prev => ({ ...prev, ...patch }))
  const rs = Math.round((d.pricePaise || 0) / 100 * 100) / 100

  const saveM = useMutation({
    mutationFn: body => isNew
      ? api('/api/admin/plans', { method: 'POST', body: JSON.stringify(body) })
      : api('/api/admin/plans/' + d.id, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      toast(isNew ? 'Plan created' : 'Plan saved')
      qc.invalidateQueries({ queryKey: qk.plans })
      onSaved()
    },
    onError: e => toast(errText(e)),
  })

  const save = () => saveM.mutate({
    name: d.name.trim(),
    pricePaise: Math.round(rs * 100),
    durationDays: Math.max(1, Math.round(+d.durationDays || 1)),
    sortOrder: Math.max(0, Math.round(+d.sortOrder || 0)),
    description: d.description?.trim() || null,
    isActive: d.isActive !== false,
  })

  return (
    <Modal title={isNew ? 'New plan' : `Edit ${d.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="block text-[13px] text-label-2 pb-[6px] px-1">Name</span>
          <TextField value={d.name} onChange={e => set({ name: e.target.value })} placeholder="Monthly unlimited" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[13px] text-label-2 pb-[6px] px-1">Price ₹</span>
            <div className="flex items-center bg-surface rounded-xl pr-2 h-[46px]">
              <span className="pl-3 text-[14px] text-label-3">₹</span>
              <NumberField value={rs} decimal onChange={v => set({ pricePaise: Math.round(v * 100) })} />
            </div>
          </label>
          <label className="block">
            <span className="block text-[13px] text-label-2 pb-[6px] px-1">Duration (days)</span>
            <div className="bg-surface rounded-xl h-[46px] flex items-center">
              <NumberField value={+d.durationDays || 0} decimal={false} onChange={v => set({ durationDays: v })} />
            </div>
          </label>
        </div>
        <label className="block">
          <span className="block text-[13px] text-label-2 pb-[6px] px-1">Description</span>
          <TextArea value={d.description || ''} onChange={e => set({ description: e.target.value })} placeholder="Shown to members at checkout" className="!min-h-[60px] !text-[15px]" />
        </label>
        <div className="flex items-center gap-3">
          <label className="flex-1 block">
            <span className="block text-[13px] text-label-2 pb-[6px] px-1">Sort order</span>
            <div className="bg-surface rounded-xl h-[46px] flex items-center">
              <NumberField value={+d.sortOrder || 0} decimal={false} onChange={v => set({ sortOrder: v })} />
            </div>
          </label>
          <div className="flex items-center gap-2 pt-[22px] pb-1">
            <span className="text-[14px]">{d.isActive !== false ? 'Active' : 'Hidden'}</span>
            <Switch checked={d.isActive !== false} onChange={v => set({ isActive: v })} />
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <BusyBtn variant="ghost" onClick={onClose} className="flex-1">Cancel</BusyBtn>
        <BusyBtn busy={saveM.isPending} icon="check" disabled={!d.name.trim()} onClick={save} className="flex-1">{isNew ? 'Create' : 'Save'}</BusyBtn>
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, listPrograms, updateProgram, enrollProgram, ptBookings, searchMembers, qk } from '@og/api-client'
import Icon from '@og/ui'
import { Check, Button, SearchField } from '@og/ui'
import { PageHead, Empty, SkelList, BusyBtn, Modal, ConfirmModal, toast, errText } from '../components/bits.jsx'

export default function Programs() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [assignFor, setAssignFor] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const listQ = useQuery({ queryKey: qk.programs, queryFn: listPrograms })
  const list = listQ.data

  useEffect(() => { if (listQ.error) toast(errText(listQ.error)) }, [listQ.error])

  const publishMut = useMutation({
    mutationFn: p => updateProgram(p.id, { isPublished: true }),
    onSuccess: (_r, p) => {
      toast('“' + p.title + '” published')
      setConfirm(null)
      qc.invalidateQueries({ queryKey: qk.programs })
      qc.invalidateQueries({ queryKey: qk.assignedPrograms })
    },
    onError: e => toast(errText(e)),
  })

  const removeMut = useMutation({
    mutationFn: p => api('/api/programs/' + p.id, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Draft deleted')
      setConfirm(null)
      qc.invalidateQueries({ queryKey: qk.programs })
    },
    onError: e => toast(errText(e)),
  })

  const cardBusy = p =>
    (publishMut.isPending && publishMut.variables?.id === p.id) ||
    (removeMut.isPending && removeMut.variables?.id === p.id)

  return (
    <div>
      <PageHead
        title="Programs"
        sub={list ? list.length + (list.length === 1 ? ' program' : ' programs') : 'Training plans'}
        right={
          <Button variant="primary" size="sm" icon="plus" onClick={() => nav('/programs/new')}>New</Button>
        } />

      {listQ.isPending ? (
        <SkelList n={3} h={96} />
      ) : list.length === 0 ? (
        <Empty icon="clipboard" title="No programs yet"
          hint="Build a multi-week plan with per-exercise programming, then assign it to your clients." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map(p => <ProgramCard key={p.id} p={p} onAssign={() => setAssignFor(p)}
            onPublish={() => setConfirm({ kind: 'publish', p })}
            onDelete={() => setConfirm({ kind: 'delete', p })}
            busy={cardBusy(p)} />)}
        </div>
      )}

      {assignFor && <AssignSheet program={assignFor} onClose={() => setAssignFor(null)} />}

      {confirm?.kind === 'publish' && (
        <ConfirmModal
          title={'Publish “' + confirm.p.title + '”?'}
          message="Published programs are immutable — members can be enrolled immediately, but the plan can no longer be edited or deleted."
          confirmText="Publish" danger={false} busy={publishMut.isPending}
          onConfirm={() => publishMut.mutate(confirm.p)} onClose={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmModal
          title={'Delete draft “' + confirm.p.title + '”?'}
          message="The draft and its weeks are removed permanently. Enrolled members keep nothing — drafts can't be enrolled anyway."
          confirmText="Delete draft" danger busy={removeMut.isPending}
          onConfirm={() => removeMut.mutate(confirm.p)} onClose={() => setConfirm(null)} />
      )}
    </div>
  )
}

function ProgramCard({ p, onAssign, onPublish, onDelete, busy }) {
  const nav = useNavigate()
  const c = p.counts || {}
  return (
    <div className="bg-surface rounded-[14px] px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[16.5px] font-semibold tracking-[-.015em] m-0 truncate">{p.title}</h3>
          <div className="text-[13px] text-label-2 mt-[2px] truncate">
            {(c.weeks ?? 0) + 'w · ' + (c.days ?? 0) + 'd · ' + (c.exercises ?? 0) + ' ex · ' + (c.enrollments ?? 0) + ' enrolled'}
            {p.level ? ' · ' + p.level : ''}
          </div>
        </div>
        <span className={'shrink-0 rounded-md px-[7px] py-[3px] text-[11px] font-medium ' +
          (p.isPublished ? 'bg-[color-mix(in_srgb,var(--green)_16%,transparent)] text-green' : 'bg-surface-3 text-label-2')}>
          {p.isPublished ? 'PUBLISHED' : 'DRAFT'}
        </span>
      </div>

      {p.description && <p className="text-[13.5px] text-label-2 leading-[1.45] mt-2 mb-0 line-clamp-2">{p.description}</p>}

      <div className="flex items-center gap-1.5 mt-3 -ml-2 flex-wrap">
        {p.mine !== false && !p.isPublished && (
          <>
            <BusyBtn size="xs" variant="tinted" busy={busy} onClick={onPublish}>Publish</BusyBtn>
            <Button size="xs" variant="ghost" icon="pencil" onClick={() => nav('/programs/' + p.id + '/edit', { state: { meta: p } })}>Edit</Button>
            <Button size="xs" variant="ghost" icon="trash" className="text-red" onClick={onDelete}>Delete</Button>
          </>
        )}
        <Button size="xs" variant="ghost" icon="person" onClick={onAssign}>Assign members</Button>
      </div>
    </div>
  )
}

function AssignSheet({ program, onClose }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState(new Set())
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => { const tm = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(tm) }, [q])

  const clientsQ = useQuery({ queryKey: qk.ptBookings, queryFn: ptBookings })
  const searchQ = useQuery({ queryKey: ['staff', 'members', dq], queryFn: () => searchMembers(dq), enabled: dq.length >= 2 })
  const searching = dq.length >= 2

  const clients = useMemo(() => {
    const m = new Map()
    for (const b of clientsQ.data || []) if (!m.has(b.member.id)) m.set(b.member.id, b.member)
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [clientsQ.data])
  // PT clients by default; any active member once the coach types a name or email.
  const list = searching ? searchQ.data || [] : clients

  const enrollMut = useMutation({
    mutationFn: ids => enrollProgram(program.id, ids),
    onSuccess: r => {
      toast(r.created + ' enrolled' + (r.skipped ? ' · ' + r.skipped + ' skipped' : ''))
      qc.invalidateQueries({ queryKey: qk.programs })
      qc.invalidateQueries({ queryKey: qk.assignedPrograms })
      onClose()
    },
    onError: e => toast(errText(e)),
  })

  const toggle = id => setSel(s => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <Modal title={'Assign “' + program.title + '”'} onClose={onClose}
      footer={
        <BusyBtn busy={enrollMut.isPending} disabled={!sel.size} onClick={() => enrollMut.mutate([...sel])}>
          {'Enroll ' + (sel.size || '') + (sel.size === 1 ? ' member' : sel.size > 1 ? ' members' : '')}
        </BusyBtn>
      }>
      <div className="mb-3">
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search any member" />
      </div>
      {(searching ? searchQ.isPending : clientsQ.isPending) ? (
        <SkelList n={3} h={46} />
      ) : list.length === 0 ? (
        searching
          ? <Empty icon="magnifier" title={'No member matches “' + dq + '”'} />
          : <Empty icon="person" title="No PT clients yet" hint="Search above to find any member of the gym." />
      ) : (
        <div className="bg-surface rounded-[14px] overflow-hidden max-h-[46vh] overflow-y-auto">
          {list.map(m => (
            <label key={m.id}
              className="lrow relative w-full flex items-center gap-3 text-left px-3.5 py-[10px] cursor-pointer no-tap active:bg-surface-2 transition-colors duration-150">
              <span className="flex-1 min-w-0 text-[16px] tracking-[-.012em] truncate">{m.name}</span>
              <Check checked={sel.has(m.id)} onChange={() => toggle(m.id)} />
            </label>
          ))}
        </div>
      )}
      <p className="text-[12.5px] text-label-3 mt-3 mb-0 leading-[1.45]">
        Members start with day 1 unlocked; advance their enrollment as they progress.
      </p>
    </Modal>
  )
}

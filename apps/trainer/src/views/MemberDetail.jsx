import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unlockFor, unlockPresets, ptBookings, qk } from '@og/api-client'
import { BODYPARTS, fmtDate } from '@og/core'
import Icon from '@og/ui'
import { Switch, TextArea } from '@og/ui'
import { PageHead, Empty, SkelList, BusyBtn, Avatar, Chip, toast, errText, fmtRange } from '../components/bits.jsx'

const STATUS_TONE = {
  BOOKED: 'text-blue',
  COMPLETED: 'text-green',
  CANCELLED: 'text-label-3',
  NO_SHOW: 'text-orange',
}

export default function MemberDetail() {
  const { id } = useParams()
  const loc = useLocation()
  const qc = useQueryClient()
  const unlocksKey = qk.unlocks(id)

  const [name, setName] = useState(loc.state?.name || null)
  const [avatarUrl, setAvatarUrl] = useState(loc.state?.avatarUrl || null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesSaved, setNotesSaved] = useState(null)

  const unlocksQ = useQuery({ queryKey: unlocksKey, queryFn: () => api('/api/exercises/unlocks/' + id) })
  const ptQ = useQuery({ queryKey: qk.ptBookings, queryFn: ptBookings })
  const presetsQ = useQuery({ queryKey: ['exercises', 'presets'], queryFn: unlockPresets })

  const data = unlocksQ.data

  useEffect(() => {
    if (loc.state?.name) return
    const hit = (ptQ.data || []).find(b => b.member.id === id)
    if (hit) { setName(hit.member.name); setAvatarUrl(hit.member.avatarUrl) }
  }, [ptQ.data, id, loc.state?.name])

  const sessions = useMemo(() => (ptQ.data || []).filter(b => b.member.id === id), [ptQ.data, id])
  const presets = presetsQ.data || []

  const invalidateUnlocks = () => qc.invalidateQueries({ queryKey: unlocksKey })

  const expMut = useMutation({
    mutationFn: v => api('/api/exercises/experienced/' + id, { method: 'POST', body: JSON.stringify({ experienced: v }) }),
    onMutate: async v => {
      await qc.cancelQueries({ queryKey: unlocksKey })
      const prev = qc.getQueryData(unlocksKey)
      qc.setQueryData(unlocksKey, old => ({ ...old, experienced: v }))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(unlocksKey, ctx.prev)
      toast(errText(e))
    },
    onSuccess: v => toast(v ? 'Marked as experienced' : 'Marked as new to training'),
    onSettled: () => invalidateUnlocks(),
  })

  const unlockBpMut = useMutation({
    mutationFn: bp => unlockFor(id, { bodypart: bp }),
    onError: e => toast(errText(e)),
    onSettled: () => invalidateUnlocks(),
  })

  const revokeMut = useMutation({
    mutationFn: rowId => api('/api/exercises/unlock/' + rowId, { method: 'DELETE' }),
    onError: e => toast(errText(e)),
    onSettled: () => invalidateUnlocks(),
  })

  const presetMut = useMutation({
    mutationFn: p => unlockFor(id, { presetId: p.id }),
    onSuccess: (_r, p) => toast('Preset “' + p.name + '” applied'),
    onError: e => toast(errText(e)),
    onSettled: () => invalidateUnlocks(),
  })

  const notesMut = useMutation({
    mutationFn: () => api('/api/trainers/member-notes/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ injuryNotes: notesDraft.trim() || null }),
    }),
    onSuccess: r => {
      setNotesSaved(r.injuryNotes)
      setNotesDraft('')
      toast(r.injuryNotes ? 'Injury notes saved' : 'Injury notes cleared')
    },
    onError: e => toast(errText(e)),
  })

  const bpSet = new Set(data?.bodyparts || [])
  const rowForBp = bp => (data?.rows || []).find(r => r.bodypart === bp && !r.exerciseId)

  const bpBusy =
    (unlockBpMut.isPending && unlockBpMut.variables) ||
    (revokeMut.isPending && revokeMut.variables) ||
    (presetMut.isPending && 'preset:' + presetMut.variables?.id) ||
    null

  const toggleExperienced = () => { if (data) expMut.mutate(!data.experienced) }

  const toggleBp = bp => {
    if (!data || bpBusy) return
    if (!bpSet.has(bp)) { unlockBpMut.mutate(bp); return }
    const row = rowForBp(bp)
    if (!row) { toast('Unlock row missing — reloading'); invalidateUnlocks(); return }
    revokeMut.mutate(row.id)
  }

  const applyPreset = p => { if (!bpBusy) presetMut.mutate(p) }

  if (unlocksQ.isError) return <Empty icon="info" title="Couldn't load member" hint={errText(unlocksQ.error)} />
  if (!data) return <div><PageHead title={name || 'Member'} back /><SkelList n={4} /></div>

  return (
    <div>
      <PageHead title="Member" sub={name || 'Unknown member'} back />

      <div className="flex items-center gap-3 mb-5">
        <Avatar name={name} url={avatarUrl} size={52} />
        <div className="min-w-0">
          <div className="text-[19px] font-semibold tracking-[-.02em] truncate">{name || id.slice(0, 8)}</div>
          <div className="text-[13px] text-label-2">
            {sessions.length + ' PT session' + (sessions.length === 1 ? '' : 's')}
            {data.experienced ? ' · experienced' : ''}
          </div>
        </div>
      </div>

      <section className="mb-[22px]">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Injury notes</h2>
        {notesSaved && (
          <div className="flex items-start gap-2 px-3.5 py-3 mb-2 text-red text-[14px] leading-[1.45] rounded-[14px] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border-[0.5px] border-[color-mix(in_srgb,var(--red)_35%,transparent)]">
            <Icon name="bolt" className="text-[16px] shrink-0 mt-[2px]" />
            <span className="whitespace-pre-wrap">{notesSaved}</span>
          </div>
        )}
        <TextArea
          placeholder="Write restrictions or injuries to save…"
          value={notesDraft}
          onChange={e => setNotesDraft(e.target.value)}
          maxLength={2000}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px] text-label-3 px-1">Saved notes show as a red banner for the member.</span>
          <BusyBtn size="sm" busy={notesMut.isPending} disabled={!notesDraft.trim()} onClick={() => notesMut.mutate()}>Save notes</BusyBtn>
        </div>
      </section>

      <section className="mb-[22px]">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Training experience</h2>
        <div className="bg-surface rounded-[14px]">
          <div className="lrow relative flex items-center gap-3 px-3.5 py-[11px] min-h-[46px]">
            <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white bg-teal"><Icon name="figureStrength" /></span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[16.5px] tracking-[-.012em]">Experienced lifter</span>
              <span className="text-[13px] text-label-2">Unlocks advanced exercise variants in their app</span>
            </span>
            <Switch checked={!!data.experienced} disabled={expMut.isPending} onChange={toggleExperienced} />
          </div>
        </div>
      </section>

      <section className="mb-[22px]">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">
          Unlocked body parts <span className="text-label-3">· {bpSet.size}/{BODYPARTS.length}</span>
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {BODYPARTS.map(bp => (
            <Chip key={bp} on={bpSet.has(bp)} disabled={!!bpBusy} onClick={() => toggleBp(bp)}>{bp}</Chip>
          ))}
        </div>
        {presets.length > 0 && (
          <>
            <h3 className="text-[13px] text-label-2 px-1 pb-[6px] m-0">Quick presets</h3>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.id} onClick={() => applyPreset(p)} disabled={!!bpBusy}
                  className="inline-flex items-center gap-[5px] rounded-full pl-[10px] pr-3 py-[7px] text-[13.5px] font-medium bg-surface-2 text-label no-tap border-0 transition-all duration-150 active:scale-95 disabled:opacity-40">
                  <Icon name="sparkles" className="text-[13px] text-gold" />{p.name}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Sessions</h2>
        {!ptQ.data && ptQ.isPending ? (
          <SkelList n={2} h={46} />
        ) : sessions.length === 0 ? (
          <Empty icon="calendar" title="No PT sessions" />
        ) : (
          <div className="bg-surface rounded-[14px] overflow-hidden">
            {sessions.map(b => (
              <div key={b.id} className="lrow relative flex items-center gap-3 px-3.5 py-[10px] min-h-[44px]">
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[15.5px] tracking-[-.012em]">{fmtDate(String(b.date).slice(0, 10), true)} · {fmtRange(b.startMin, b.endMin)}</span>
                  {b.notes && <span className="text-[12.5px] text-label-2 truncate">{b.notes}</span>}
                </span>
                <span className={'text-[12.5px] font-medium shrink-0 ' + (STATUS_TONE[b.status] || 'text-label-2')}>
                  {b.status || ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

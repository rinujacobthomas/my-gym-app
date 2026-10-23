import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ptBookings, listPrograms, searchMembers, qk } from '@og/api-client'
import { todayISO, fmtDate } from '@og/core'
import Icon from '@og/ui'
import { SearchField } from '@og/ui'
import { PageHead, Empty, SkelList, Avatar, errText, toast } from '../components/bits.jsx'

export default function Members() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  useEffect(() => { const tm = setTimeout(() => setDq(q.trim()), 300); return () => clearTimeout(tm) }, [q])
  // Anyone in the gym, not just PT clients — coaches program for floor members too.
  const searchQ = useQuery({ queryKey: ['staff', 'members', dq], queryFn: () => searchMembers(dq), enabled: dq.length >= 2 })

  const rowsQ = useQuery({ queryKey: qk.ptBookings, queryFn: ptBookings })
  const programsQ = useQuery({ queryKey: qk.programs, queryFn: listPrograms })

  useEffect(() => { if (rowsQ.error) toast(errText(rowsQ.error)) }, [rowsQ.error])

  const rows = rowsQ.data

  const groups = useMemo(() => {
    const m = new Map()
    for (const b of rows || []) {
      let g = m.get(b.member.id)
      if (!g) {
        g = { id: b.member.id, name: b.member.name, avatarUrl: b.member.avatarUrl, count: 0, next: null, last: null }
        m.set(b.member.id, g)
      }
      g.count++
      const d = typeof b.date === 'string' ? b.date.slice(0, 10) : null
      if (!d) continue
      if (d >= todayISO()) { if (!g.next || d < g.next) g.next = d }
      else if (!g.last || d > g.last) g.last = d
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? groups.filter(g => g.name.toLowerCase().includes(s)) : groups
  }, [groups, q])

  const myPrograms = (programsQ.data || []).filter(p => p.mine !== false)
  const clientIds = new Set(groups.map(g => g.id))
  const others = dq.length >= 2 ? (searchQ.data || []).filter(m => !clientIds.has(m.id)) : []

  return (
    <div>
      <PageHead title="Members" sub={rows ? groups.length + ' client' + (groups.length === 1 ? '' : 's') : 'Your clients'} />

      <div className="mb-4">
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search any member by name or email" />
      </div>

      {rowsQ.isPending ? (
        <SkelList n={4} h={62} />
      ) : groups.length === 0 ? (
        !q.trim() && <Empty icon="person" title="No PT clients yet"
          hint="Clients who book 1-on-1 sessions with you show up here. Search above to find any other member." />
      ) : filtered.length === 0 ? (
        !others.length && <Empty icon="magnifier" title={'No match for “' + q.trim() + '”'} />
      ) : (
        <div className="bg-surface rounded-[14px] overflow-hidden mb-6">
          {filtered.map(g => (
            <button key={g.id} onClick={() => nav('/members/' + g.id, { state: { name: g.name } })}
              className="lrow relative w-full flex items-center gap-3 text-left px-3.5 py-[11px] min-h-[58px] bg-transparent border-0 no-tap active:bg-surface-2 transition-colors duration-150">
              <Avatar name={g.name} url={g.avatarUrl} size={38} />
              <span className="flex-1 min-w-0 flex flex-col gap-px">
                <span className="text-[16.5px] tracking-[-.012em] truncate">{g.name}</span>
                <span className="text-[13px] text-label-2 truncate">
                  {g.count + ' session' + (g.count === 1 ? '' : 's')}
                  {g.next ? ' · next ' + fmtDate(g.next, true) : ''}
                  {!g.next && g.last ? ' · last ' + fmtDate(g.last, true) : ''}
                </span>
              </span>
              <Icon name="chevronRight" className="text-label-3 text-[15px] shrink-0 [--icon-stroke:2.4]" />
            </button>
          ))}
        </div>
      )}

      {others.length > 0 && <>
        <h2 className="text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Other members</h2>
        <div className="bg-surface rounded-[14px] overflow-hidden mb-6">
          {others.map(m => (
            <button key={m.id} onClick={() => nav('/members/' + m.id, { state: { name: m.name, avatarUrl: m.avatarUrl } })}
              className="lrow relative w-full flex items-center gap-3 text-left px-3.5 py-[11px] min-h-[58px] bg-transparent border-0 no-tap active:bg-surface-2 transition-colors duration-150">
              <Avatar name={m.name} url={m.avatarUrl} size={38} />
              <span className="flex-1 min-w-0 flex flex-col gap-px">
                <span className="text-[16.5px] tracking-[-.012em] truncate">{m.name}</span>
                <span className="text-[13px] text-label-2 truncate">{m.email}</span>
              </span>
              <Icon name="chevronRight" className="text-label-3 text-[15px] shrink-0 [--icon-stroke:2.4]" />
            </button>
          ))}
        </div>
      </>}
      {dq.length >= 2 && searchQ.isSuccess && !others.length && !filtered.length && groups.length === 0 && (
        <Empty icon="magnifier" title={'No member matches “' + dq + '”'} />
      )}

      <h2 className="text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">My programs</h2>
      {programsQ.isPending ? (
        <SkelList n={2} h={54} />
      ) : myPrograms.length === 0 ? (
        <div className="bg-surface rounded-[14px] px-3.5 py-3.5 text-[14px] text-label-2">No programs yet — create one under Programs.</div>
      ) : (
        <div className="bg-surface rounded-[14px] overflow-hidden">
          {myPrograms.slice(0, 8).map(p => (
            <button key={p.id} onClick={() => nav('/programs')}
              className="lrow relative w-full flex items-center gap-3 text-left px-3.5 py-[11px] bg-transparent border-0 no-tap active:bg-surface-2 transition-colors duration-150">
              <span className="w-[29px] h-[29px] rounded-[7px] shrink-0 text-[17px] flex items-center justify-center text-white bg-acc"><Icon name="list" /></span>
              <span className="flex-1 min-w-0 text-[15.5px] tracking-[-.012em] truncate">{p.title}</span>
              <span className="text-label-2 text-[13px] tabular-nums shrink-0">{p.counts?.enrollments ?? 0} enrolled</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

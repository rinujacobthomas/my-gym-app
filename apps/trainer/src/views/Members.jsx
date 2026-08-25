import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ptBookings, listPrograms, qk } from '@og/api-client'
import { todayISO, fmtDate } from '@og/core'
import Icon from '@og/ui'
import { SearchField } from '@og/ui'
import { PageHead, Empty, SkelList, Avatar, errText, toast } from '../components/bits.jsx'

export default function Members() {
  const nav = useNavigate()
  const [q, setQ] = useState('')

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

  return (
    <div>
      <PageHead title="Members" sub={rows ? groups.length + ' client' + (groups.length === 1 ? '' : 's') : 'Your clients'} />

      <div className="mb-4">
        <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder="Search clients" />
      </div>

      {rowsQ.isPending ? (
        <SkelList n={4} h={62} />
      ) : groups.length === 0 ? (
        <Empty icon="person" title="No PT clients yet"
          hint="Clients appear here once they book a personal training session with you. Program enrollments are managed under Programs." />
      ) : filtered.length === 0 ? (
        <Empty icon="magnifier" title={'No match for “' + q.trim() + '”'} />
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
      <p className="text-label-3 text-[12px] px-1 pt-[7px] leading-[1.45]">
        A staff-facing member directory isn't available yet, so this screen lists your training clients and programs.
      </p>
    </div>
  )
}

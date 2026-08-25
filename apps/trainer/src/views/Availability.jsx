import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { myTrainerProfile, updateTrainerProfile, qk } from '@og/api-client'
import Icon from '@og/ui'
import { Segmented, Stepper, TextArea, TextField } from '@og/ui'
import { PageHead, Empty, SkelList, BusyBtn, Modal, toast, errText, minToT } from '../components/bits.jsx'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const KINDS = [
  { value: 'PUBLIC', label: 'Open' },
  { value: 'PRIVATE_BREAK', label: 'Break' },
]
const snap15 = m => Math.round(m / 15) * 15
const clampWin = w => ({ ...w, startMin: Math.min(1425, Math.max(0, snap15(w.startMin))), endMin: Math.min(1440, Math.max(15, snap15(w.endMin))) })

export default function Availability() {
  const qc = useQueryClient()
  const [bio, setBio] = useState('')
  const [specStr, setSpecStr] = useState('')
  const [buffer, setBuffer] = useState(10)
  const [wins, setWins] = useState([])
  const initialRef = useRef('')
  const seededRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [picking, setPicking] = useState(null)

  const profileQ = useQuery({ queryKey: qk.trainerMe, queryFn: myTrainerProfile })

  useEffect(() => {
    const p = profileQ.data
    if (!p || seededRef.current) return
    seededRef.current = true
    const av = (p.availability || []).map(a => ({
      weekday: a.weekday, startMin: a.startMin, endMin: a.endMin,
      kind: a.kind === 'PRIVATE_BREAK' ? 'PRIVATE_BREAK' : 'PUBLIC',
    })).sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
    setWins(av)
    setBio(p.bio || '')
    setSpecStr((p.specialties || []).join(', '))
    setBuffer(p.bufferMin ?? 10)
    initialRef.current = JSON.stringify(snapshot({ bio: p.bio || '', specStr: (p.specialties || []).join(', '), buffer: p.bufferMin ?? 10, wins: av }))
  }, [profileQ.data])

  const mark = next => {
    setDirty(JSON.stringify(snapshot(next)) !== initialRef.current)
  }

  const patch = partial => {
    const next = { bio, specStr, buffer, wins, ...partial }
    setBio(next.bio); setSpecStr(next.specStr); setBuffer(next.buffer); setWins(next.wins)
    mark(next)
  }

  const errors = useMemo(() => {
    const out = {}
    for (let wd = 0; wd < 7; wd++) {
      for (const w of wins.filter(x => x.weekday === wd)) {
        if (w.startMin >= w.endMin) { out[wd] = 'A window ends before it starts.'; break }
      }
      const pub = wins.filter(x => x.weekday === wd && x.kind === 'PUBLIC').sort((a, b) => a.startMin - b.startMin)
      for (let i = 1; i < pub.length; i++) {
        if (pub[i].startMin < pub[i - 1].endMin) { out[wd] = 'Overlapping open hours — breaks are fine, open windows are not.'; break }
      }
    }
    return out
  }, [wins])

  const saveMut = useMutation({
    mutationFn: vars => updateTrainerProfile(vars.payload),
    onSuccess: (_r, vars) => {
      setWins([...vars.clean].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin))
      initialRef.current = JSON.stringify(snapshot(vars.baseline))
      setDirty(false)
      toast('Availability saved')
      qc.invalidateQueries({ queryKey: qk.trainerMe })
    },
    onError: e => toast(errText(e)),
  })

  const save = () => {
    const clean = wins.map(clampWin).filter(w => w.startMin < w.endMin)
    const specialties = [...new Set(specStr.split(',').map(s => s.trim()).filter(Boolean))]
    const buf = Math.min(600, Math.max(0, Math.round(buffer)))
    saveMut.mutate({
      payload: {
        bio: bio.trim() || null,
        specialties,
        bufferMin: buf,
        availability: clean.map(({ weekday, startMin, endMin, kind }) => ({ weekday, startMin, endMin, kind })),
      },
      clean,
      baseline: { bio: bio.trim() || '', specStr: specialties.join(', '), buffer: buf, wins: clean },
    })
  }

  if (profileQ.error?.status === 403) {
    return (
      <div>
        <PageHead title="My hours" />
        <Empty icon="lock" title="Trainer account required"
          hint="Weekly hours belong to trainer profiles. Ask an admin to upgrade your role to TRAINER to edit them." />
      </div>
    )
  }
  if (profileQ.isError) {
    return (
      <div>
        <PageHead title="My hours" />
        <Empty icon="info" title="Couldn't load your profile" hint={errText(profileQ.error)} />
      </div>
    )
  }
  if (!profileQ.data) return <div><PageHead title="My hours" /><SkelList n={5} h={70} /></div>

  const errCount = Object.keys(errors).length

  return (
    <div className="pb-6">
      <PageHead title="My hours"
        sub={dirty ? 'Unsaved changes' : 'Members book inside your open windows'}
        right={<BusyBtn size="sm" busy={saveMut.isPending} disabled={!dirty || errCount > 0} onClick={save}>Save</BusyBtn>} />

      <section className="mb-5">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Weekly windows</h2>
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4, 5, 6].map(wd => (
            <DayBlock key={wd} wd={wd} wins={wins} errors={errors}
              onChange={nextWins => patch({ wins: [...nextWins].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin) })}
              onPick={setPicking} />
          ))}
        </div>
        <p className="text-[12.5px] text-label-3 px-1 pt-[7px] leading-[1.45] m-0">
          Break blocks are invisible to members and can overlap your open hours.
        </p>
      </section>

      {errCount > 0 && (
        <div className="bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-red rounded-xl px-4 py-3 text-[13.5px] mb-5 flex items-center gap-2">
          <Icon name="info" className="text-[16px] shrink-0" />
          Fix the highlighted days before saving.
        </div>
      )}

      <section className="mb-5">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Booking buffer</h2>
        <div className="bg-surface rounded-[14px] px-3.5 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0 text-[14px] text-label-2 leading-[1.4]">Gap kept free between PT sessions.</div>
          <Stepper className="w-[150px] shrink-0" decimal={false} step={5} unit="min" value={buffer} onChange={v => patch({ buffer: v })} />
        </div>
      </section>

      <section className="mb-5">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Specialties</h2>
        <TextField placeholder="Strength, weight loss, mobility…" value={specStr} onChange={e => patch({ specStr: e.target.value })} maxLength={300} />
      </section>

      <section>
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Bio</h2>
        <TextArea placeholder="Introduce yourself to members…" value={bio} onChange={e => patch({ bio: e.target.value })} maxLength={2000} />
      </section>

      <div className="mt-5">
        <BusyBtn busy={saveMut.isPending} disabled={!dirty || errCount > 0} onClick={save}>Save availability</BusyBtn>
      </div>

      {picking && (
        <TimePickModal pick={picking} onSet={v => {
          patch({ wins: wins.map(w => w === picking.win ? { ...w, [picking.field]: v } : w) })
          setPicking(null)
        }} onClose={() => setPicking(null)} />
      )}
    </div>
  )
}

const snapshot = s => ({ b: s.bio, sp: s.specStr.replace(/\s+/g, ' ').trim(), bu: +s.buffer, w: s.wins.map(w => [w.weekday, w.startMin, w.endMin, w.kind]) })

function DayBlock({ wd, wins, errors, onChange, onPick }) {
  const mine = wins.filter(w => w.weekday === wd).sort((a, b) => a.startMin - b.startMin)
  const add = () => {
    const last = mine[mine.length - 1]
    const start = clampWin({ startMin: last ? last.endMin : 540, endMin: 0 }).startMin
    onChange([...wins, { weekday: wd, startMin: Math.min(start, 1320), endMin: Math.min(start + 120, 1440), kind: 'PUBLIC' }])
  }
  return (
    <div className={'bg-surface rounded-[14px] px-3.5 py-3 ' + (errors[wd] ? 'shadow-[inset_0_0_0_1.5px_var(--red)]' : '')}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[15px] font-semibold tracking-[-.01em]">{DAY_NAMES[wd]}</span>
        {!mine.length && <span className="text-[12.5px] text-label-3">Off</span>}
      </div>

      {mine.map((w, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5">
          <Segmented className="seg-inline w-[128px] shrink-0" options={KINDS} value={w.kind}
            onChange={v => onChange(wins.map(x => x === w ? { ...x, kind: v } : x))} />
          <button onClick={() => onPick({ win: w, field: 'startMin' })}
            className="flex-1 min-w-[64px] h-11 rounded-[10px] bg-surface-2 text-[15.5px] font-medium tabular-nums border-0 no-tap active:bg-surface-3 transition-colors">
            {minToT(w.startMin)}
          </button>
          <span className="text-label-3 shrink-0">–</span>
          <button onClick={() => onPick({ win: w, field: 'endMin' })}
            className="flex-1 min-w-[64px] h-11 rounded-[10px] bg-surface-2 text-[15.5px] font-medium tabular-nums border-0 no-tap active:bg-surface-3 transition-colors">
            {minToT(w.endMin)}
          </button>
          <button aria-label="Remove window" onClick={() => onChange(wins.filter(x => x !== w))}
            className="w-9 h-9 rounded-lg shrink-0 bg-transparent text-label-3 text-[15px] flex items-center justify-center no-tap active:bg-surface-2 active:text-red transition-colors">
            <Icon name="trash" />
          </button>
        </div>
      ))}

      {errors[wd] && <div className="text-red text-[12.5px] pt-1">{errors[wd]}</div>}

      <button onClick={add}
        className="mt-1 inline-flex items-center gap-1 text-acc text-[13.5px] font-medium bg-transparent border-0 no-tap active:opacity-60">
        <Icon name="plus" className="text-[14px] [--icon-stroke:2.4]" />Add window
      </button>
    </div>
  )
}

function TimePickModal({ pick, onSet, onClose }) {
  const cur = pick.win[pick.field]
  const options = new Set([cur])
  for (let m = 0; m <= 1440; m += 15) options.add(m)
  const list = [...options].sort((a, b) => a - b)
  return (
    <Modal title={(pick.field === 'startMin' ? 'Starts at' : 'Ends at') + ' · ' + minToT(cur)} onClose={onClose}>
      <div className="grid grid-cols-4 gap-1.5 max-h-[52vh] overflow-y-auto pr-0.5">
        {list.map(m => (
          <button key={m} onClick={() => onSet(m)}
            className={'py-[9px] rounded-[10px] text-[14.5px] font-medium tabular-nums border-0 no-tap transition-colors duration-150 ' +
              (m === cur ? 'bg-acc text-on-acc' : 'bg-surface text-label active:bg-surface-2')}>
            {minToT(m)}
          </button>
        ))}
      </div>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createProgram, updateProgram, listPrograms, qk } from '@og/api-client'
import { EXDB, EXIDX, exOr, isCardio } from '@og/core'
import Icon from '@og/ui'
import { TextField, TextArea, SearchField, Segmented, Stepper, NumberField, Switch, Button } from '@og/ui'
import { PageHead, Empty, BusyBtn, Modal, Chip, toast, errText } from '../components/bits.jsx'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const blankEx = exerciseId => isCardio(exerciseId)
  ? { exerciseId, mode: 'cardio', sets: 1, reps: null, sec: null, min: 20, speed: 10, weightKg: null, bodyweight: false, perSide: false, restSec: null, notes: '' }
  : { exerciseId, mode: 'reps', sets: 3, reps: 10, sec: null, min: null, speed: null, weightKg: null, bodyweight: false, perSide: false, restSec: 90, notes: '' }

const newDay = i => ({ label: 'Day ' + (i + 1), focusNote: '', exercises: [] })

export default function ProgramBuilder() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { id } = useParams()
  const editing = !!id

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel] = useState('')
  const [weeks, setWeeks] = useState([{ days: [newDay(0)] }])
  const [publish, setPublish] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(!editing)
  const [metaErr, setMetaErr] = useState(null)
  const [picker, setPicker] = useState(null)

  const progQ = useQuery({ queryKey: qk.programs, queryFn: listPrograms, enabled: editing })

  useEffect(() => {
    if (!editing || metaLoaded || metaErr || progQ.isPending) return
    if (progQ.isError) { setMetaErr(errText(progQ.error)); return }
    const p = (progQ.data || []).find(x => x.id === id)
    if (!p) { setMetaErr('Program not found among your programs.'); return }
    if (p.isPublished) { setMetaErr('This program is published and immutable. Clone it as a new program instead.'); return }
    setTitle(p.title || '')
    setDescription(p.description || '')
    setLevel(p.level || '')
    setMetaLoaded(true)
  }, [editing, metaLoaded, metaErr, progQ.status, progQ.data, id])

  const saveMut = useMutation({
    mutationFn: async vars => {
      if (editing) {
        await updateProgram(id, vars.publish ? { ...vars.payload, isPublished: true } : vars.payload)
      } else {
        const r = await createProgram(vars.payload)
        if (vars.publish && r.id) await updateProgram(r.id, { isPublished: true })
      }
    },
    onSuccess: (_r, vars) => {
      toast(vars.publish
        ? (editing ? 'Program saved & published' : 'Program created & published')
        : (editing ? 'Draft updated' : 'Draft saved'))
      qc.invalidateQueries({ queryKey: qk.programs })
      if (vars.publish) qc.invalidateQueries({ queryKey: qk.assignedPrograms })
      nav('/programs', { replace: true })
    },
    onError: e => toast(errText(e)),
  })

  const updWeeks = fn => setWeeks(w => {
    const next = structuredClone(w)
    fn(next)
    return next
  })

  const validate = () => {
    if (!title.trim()) return 'Give the program a title.'
    if (!weeks.length) return 'Add at least one week.'
    for (let wi = 0; wi < weeks.length; wi++) {
      if (!weeks[wi].days.length) return 'Week ' + (wi + 1) + ' has no days.'
      for (let di = 0; di < weeks[wi].days.length; di++) {
        if (!weeks[wi].days[di].label.trim()) return 'Week ' + (wi + 1) + ': every day needs a label.'
      }
    }
    return null
  }

  const save = () => {
    const problem = validate()
    if (problem) { toast(problem); return }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      level: level.trim() || null,
      weeks: weeks.map(w => ({
        days: w.days.map(d => ({
          label: d.label.trim(),
          focusNote: d.focusNote?.trim() || null,
          exercises: d.exercises.map(x => ({
            exerciseId: x.exerciseId, mode: x.mode, sets: Math.round(+x.sets || 1),
            reps: x.mode === 'reps' ? (x.reps ?? null) : null,
            sec: x.mode === 'time' ? (x.sec ?? null) : null,
            min: x.mode === 'cardio' ? (x.min ?? null) : null,
            speed: x.mode === 'cardio' ? (x.speed ?? null) : null,
            weightKg: x.weightKg ?? null,
            bodyweight: !!x.bodyweight, perSide: !!x.perSide,
            restSec: x.restSec ?? null,
            notes: x.notes?.trim() || null,
          })),
        })),
      })),
    }
    saveMut.mutate({ payload, publish })
  }

  const stats = useMemo(() => {
    let d = 0, ex = 0
    for (const w of weeks) for (const day of w.days) { d++; ex += day.exercises.length }
    return { w: weeks.length, d, ex }
  }, [weeks])

  if (!metaLoaded || metaErr) {
    return (
      <div>
        <PageHead title={editing ? 'Edit draft' : 'New program'} back />
        {metaErr ? <Empty icon="info" title="Can't edit this program" hint={metaErr} /> : <Empty icon="clock" title="Loading program…" />}
      </div>
    )
  }

  return (
    <div className="pb-6">
      <PageHead title={editing ? 'Edit draft' : 'New program'} sub={stats.w + 'w · ' + stats.d + 'd · ' + stats.ex + ' exercises'}
        right={<BusyBtn size="sm" busy={saveMut.isPending} onClick={save}>{editing ? 'Save' : 'Create'}</BusyBtn>} />

      {editing && (
        <div className="bg-[color-mix(in_srgb,var(--orange)_12%,transparent)] text-orange rounded-xl px-4 py-3 text-[13px] leading-[1.45] mb-4 flex items-start gap-2">
          <Icon name="info" className="text-[16px] shrink-0 mt-[2px]" />
          <span>Saving replaces the whole week structure — the API doesn't expose the stored tree for editing yet, so re-enter the days and exercises.</span>
        </div>
      )}

      <section className="mb-5">
        <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">Details</h2>
        <div className="flex flex-col gap-2">
          <TextField placeholder="Program title" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} />
          <TextArea placeholder="Description — who it's for, goals, schedule…" value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} />
          <Segmented options={[{ value: '', label: 'No level' }, ...LEVELS.map(l => ({ value: l, label: l }))]} value={level} onChange={setLevel} className="seg-inline" />
        </div>
      </section>

      {weeks.map((w, wi) => (
        <section key={wi} className="mb-5">
          <h2 className="flex items-center justify-between block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px] m-0">
            <span>Week {wi + 1}</span>
            <button onClick={() => updWeeks(ws => { ws.splice(wi, 1) })} disabled={weeks.length === 1}
              className="text-red text-[12.5px] font-medium bg-transparent border-0 no-tap disabled:opacity-30 active:opacity-60">
              Remove week
            </button>
          </h2>

          <div className="flex flex-col gap-2.5">
            {w.days.map((d, di) => (
              <div key={di} className="bg-surface rounded-[14px] px-3.5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-[26px] h-[26px] rounded-full bg-surface-3 text-label-2 text-[12.5px] font-semibold flex items-center justify-center shrink-0">{di + 1}</span>
                  <TextField className="flex-1 bg-surface-2" placeholder={'Day ' + (di + 1) + ' label · e.g. Push A'}
                    value={d.label} onChange={e => updWeeks(ws => { ws[wi].days[di].label = e.target.value })} maxLength={120} />
                  <button aria-label="Remove day" onClick={() => updWeeks(ws => { ws[wi].days.splice(di, 1) })}
                    className="w-8 h-8 rounded-lg shrink-0 bg-transparent text-label-3 text-[15px] flex items-center justify-center no-tap active:bg-surface-2 active:text-red">
                    <Icon name="trash" />
                  </button>
                </div>
                <input className="w-full bg-transparent border-0 outline-none text-[13.5px] text-label-2 placeholder:text-label-3 px-1 pb-1"
                  placeholder="Focus note · e.g. heavy compounds, keep RIR 2"
                  value={d.focusNote} onChange={e => updWeeks(ws => { ws[wi].days[di].focusNote = e.target.value })} maxLength={1000} />

                {d.exercises.map((x, xi) => (
                  <ExRow key={xi} x={x} idx={xi}
                    onUpd={fn => updWeeks(ws => { fn(ws[wi].days[di].exercises[xi]) })}
                    onDel={() => updWeeks(ws => { ws[wi].days[di].exercises.splice(xi, 1) })} />
                ))}

                <Button size="sm" variant="ghost" icon="plus" className="mt-1 -ml-1"
                  onClick={() => setPicker({ wi, di })}>
                  Add exercise
                </Button>
              </div>
            ))}
            <Button size="sm" variant="tinted" icon="plus" className="self-start"
              onClick={() => updWeeks(ws => { ws[wi].days.push(newDay(ws[wi].days.length)) })}>
              Add day
            </Button>
          </div>
        </section>
      ))}

      <div className="flex gap-2 mb-5">
        <Button size="sm" variant="tinted" icon="plus" className="self-start"
          onClick={() => { updWeeks(ws => { ws.push({ days: [newDay(0)] }) }); }}>
          Add week
        </Button>
      </div>

      <div className="bg-surface rounded-[14px] px-4 py-3.5 flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="text-[15.5px] font-medium tracking-[-.01em]">Publish immediately</div>
          <div className="text-[12.5px] text-label-2 leading-[1.4]">Locked after publishing — leave off to keep an editable draft.</div>
        </div>
        <Switch checked={publish} onChange={setPublish} />
      </div>

      <BusyBtn busy={saveMut.isPending} onClick={save}>{editing ? 'Save changes' : 'Create program'}</BusyBtn>

      {picker && (
        <ExPicker target={picker}
          onPick={exId => updWeeks(ws => { ws[picker.wi].days[picker.di].exercises.push(blankEx(exId)) })}
          onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

function ExRow({ x, idx, onUpd, onDel }) {
  const [open, setOpen] = useState(false)
  const ex = exOr(x.exerciseId)
  const cardio = x.mode === 'cardio'
  const timed = x.mode === 'time'

  const summary = [
    cardio
      ? (x.min ? x.min + ' min' : '') + (x.speed ? ' @ ' + x.speed : '')
      : x.sets + '×' + (timed ? (x.sec ? x.sec + 's' : '?') : (x.reps ?? '?')) + (x.perSide ? ' /side' : ''),
    !x.bodyweight && x.weightKg != null && !cardio ? x.weightKg + ' kg' : '',
    x.restSec ? 'rest ' + x.restSec + 's' : '',
    x.notes ? '·' : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl bg-surface-2 mb-1.5 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button onClick={() => setOpen(o => !o)} className="flex-1 min-w-0 text-left bg-transparent border-0 no-tap">
          <div className="text-[14.5px] font-medium tracking-[-.01em] truncate">{idx + 1}. {ex.n}</div>
          <div className="text-[12px] text-label-2 truncate">{summary}{x.notes ? ' · ' + x.notes : ''}</div>
        </button>
        <button onClick={() => setOpen(o => !o)} aria-label="Edit exercise"
          className={'w-8 h-8 rounded-lg shrink-0 flex items-center justify-center no-tap transition-colors ' + (open ? 'text-acc bg-acc-soft' : 'text-label-3 active:bg-surface-2')}>
          <Icon name={open ? 'chevronUp' : 'pencil'} />
        </button>
        <button onClick={onDel} aria-label="Remove exercise"
          className="w-8 h-8 rounded-lg shrink-0 text-label-3 flex items-center justify-center no-tap active:bg-surface-2 active:text-red">
          <Icon name="trash" />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t-[0.5px] border-sep-op">
          <Segmented className="seg-inline mt-1"
            options={[{ value: 'reps', label: 'Reps' }, { value: 'time', label: 'Time' }, { value: 'cardio', label: 'Cardio' }]}
            value={x.mode} onChange={v => onUpd(e => { e.mode = v })} />

          <div className="grid grid-cols-2 gap-2">
            {!cardio && <Stepper label="Sets" unit="sets" decimal={false} step={1} value={x.sets} onChange={v => onUpd(e => { e.sets = v })} />}
            {x.mode === 'reps' && <Stepper label="Reps" unit="reps" decimal={false} step={1} value={x.reps ?? 0} onChange={v => onUpd(e => { e.reps = v })} />}
            {timed && <Stepper label="Duration" unit="sec" decimal={false} step={5} value={x.sec ?? 0} onChange={v => onUpd(e => { e.sec = v })} />}
            {cardio && <Stepper label="Duration" unit="min" decimal={false} step={5} value={x.min ?? 0} onChange={v => onUpd(e => { e.min = v })} />}
            {cardio && <Stepper label="Speed" unit="km/h" step={0.5} value={x.speed ?? 0} onChange={v => onUpd(e => { e.speed = v })} />}
            {x.restSec != null && <Stepper label="Rest" unit="sec" decimal={false} step={15} value={x.restSec} onChange={v => onUpd(e => { e.restSec = v })} />}
          </div>

          {!cardio && (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-[13.5px] text-label-2 min-w-[130px]">
                Weight
                <span className="w-[86px] bg-surface rounded-[10px] px-2 py-1.5 flex items-center text-[14px]">
                  <NumberField nullable value={x.weightKg} onChange={v => onUpd(e => { e.weightKg = v })} />
                  <i className="not-italic text-[11px] text-label-2">kg</i>
                </span>
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-label-2">
                Bodyweight only
                <Switch checked={!!x.bodyweight} onChange={v => onUpd(e => { e.bodyweight = v; if (v) e.weightKg = null })} />
              </label>
              <label className="flex items-center gap-2 text-[13.5px] text-label-2">
                Per side
                <Switch checked={!!x.perSide} onChange={v => onUpd(e => { e.perSide = v })} />
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <TextField className="bg-surface-2 text-[14px]" placeholder="Coach note for this exercise"
              value={x.notes} onChange={e => onUpd(ex2 => { ex2.notes = e.target.value })} maxLength={500} />
            {x.restSec == null && (
              <Button size="xs" variant="ghost" onClick={() => onUpd(e => { e.restSec = 90 })}>+rest</Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExPicker({ target, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [added, setAdded] = useState(new Set())

  const bps = useMemo(() => [...new Set(EXDB.map(e => e.bp))].sort(), [])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    return EXDB.filter(e =>
      (!bp || e.bp === bp) &&
      (!s || e.n.toLowerCase().includes(s) || e.bp.includes(s)))
      .slice(0, 80)
  }, [q, bp])

  const pick = id => {
    onPick(id)
    setAdded(s => new Set(s).add(id))
  }

  return (
    <Modal title="Add exercise" onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>{added.size ? 'Done — ' + added.size + ' added' : 'Done'}</Button>}>
      <div className="flex flex-col gap-2.5 mb-3">
        <SearchField autoFocus value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={'Search ' + EXDB.length + ' exercises'} />
        <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip on={!bp} onClick={() => setBp('')}>All</Chip>
          {bps.map(b => <Chip key={b} on={bp === b} onClick={() => setBp(bp === b ? '' : b)}>{b}</Chip>)}
        </div>
      </div>

      {results.length === 0 ? (
        <Empty icon="magnifier" title="Nothing matches" hint="Try another term or clear the body-part filter." />
      ) : (
        <div className="bg-surface rounded-[14px] overflow-hidden max-h-[46vh] overflow-y-auto">
          {results.map(e => (
            <button key={e.id} onClick={() => pick(e.id)}
              className="lrow relative w-full flex items-center gap-3 text-left px-3.5 py-[9px] bg-transparent border-0 no-tap active:bg-surface-2 transition-colors duration-150">
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[15px] tracking-[-.01em] truncate">{e.n}</span>
                <span className="text-[12px] text-label-3 truncate">{e.bp} · {e.eq}</span>
              </span>
              {EXIDX[e.id] && added.has(e.id)
                ? <Icon name="checkCircle" className="text-acc text-[18px] shrink-0" />
                : <Icon name="plus" className="text-label-3 text-[17px] shrink-0 [--icon-stroke:2.2]" />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

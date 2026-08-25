import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { fmtDate, fmtNum, fmtVol, fmtDur } from '../lib/format.js'
import { workoutVolume, setsDone } from '../lib/history.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Admin-only operator dashboard (owner passkey + admin flag; guarded again server-side).
// Deliberately English-only — it isn't part of the translated end-user surface, so it stays
// out of the per-language string packs.

const rel = ts => {
  if (!ts) return 'never'
  const s = Math.max(0, (Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}
const dur = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60) + 'm' }

function UserDetail({ id, onChanged, close }) {
  const [d, setD] = useState(null)
  const toast = useUI(s => s.toast)
  useEffect(() => { api('/api/admin/user?id=' + encodeURIComponent(id)).then(setD).catch(e => toast(e.message)) }, [id])
  if (!d) return <div className="text-label-2 text-[13px] leading-[1.38]">Loading…</div>
  const u = d.user
  const setDisabled = disabled => {
    api('/api/admin/user/disable', { method: 'POST', body: JSON.stringify({ id: u.id, disabled }) })
      .then(() => { toast(disabled ? 'User disabled' : 'User enabled'); onChanged(); close() })
      .catch(e => toast(e.message))
  }
  return <>
    <h3 className="text-[20px] font-semibold tracking-[-.021em] mb-3.5 capitalize">{u.name}</h3>
    <div className="flex items-center gap-1.5 flex-wrap my-2 mb-3">
      {u.admin && <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium">admin</span>}
      {u.disabled && <span className="inline-flex items-center gap-[3px] bg-surface-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium text-red">disabled</span>}
      {u.invitedBy && <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium">invite {u.invitedBy}</span>}
      <span className="inline-flex items-center gap-[3px] bg-surface-2 text-label-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium">joined {u.created ? fmtDate(u.created.slice(0, 10)) : '—'}</span>
    </div>
    <div className="grid grid-cols-2 gap-2.5 mb-3 text-left">
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Workouts</div><div className="text-[17.6px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{d.workouts.length}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Weigh-ins</div><div className="text-[17.6px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{d.bodyweight.length}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Routines</div><div className="text-[17.6px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{d.routines.length}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Last sync</div><div className="text-[15.2px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{rel(d.lastSync)}</div></div>
    </div>
    {!u.admin && <button className={'inline-flex items-center justify-center gap-[7px] w-full px-[18px] py-[14px] rounded-xl text-[17px] font-semibold tracking-[-.012em] no-tap transition-[transform,background-color,opacity] duration-150 ease-[var(--ease)] active:scale-[.975] my-3 mb-1 ' + (u.disabled ? 'bg-acc text-on-acc active:bg-acc-2' : 'bg-[color-mix(in_srgb,var(--red)_15%,transparent)] text-red')}
      onClick={() => u.disabled ? setDisabled(false)
        : confirmSheet({ title: 'Disable ' + u.name + '?', message: 'They are signed out everywhere and can no longer sync or log in until re-enabled.', confirmText: 'Disable', danger: true, onConfirm: () => setDisabled(true) })}>
      {u.disabled ? 'Enable account' : 'Disable account'}</button>}
    <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1">Workout history</h4>
    {d.workouts.length ? <div className="flex flex-col">
      {d.workouts.slice(0, 60).map(w => <div key={w.id} className="flex items-center justify-between py-[9px] px-0.5 border-b border-sep">
        <div><div className="text-[13px] leading-[1.38] font-semibold">{w.name}</div>
          <div className="text-label-3" style={{ fontSize: '.72rem' }}>{fmtDate(w.d, true)} · {fmtDur((w.end || w.start) - w.start)} · {setsDone(w)} sets{w.prs?.length ? ' · ' + w.prs.length + ' PR' : ''}</div></div>
        <span className="text-[13px] leading-[1.38] text-label-2">{fmtVol(w.vol ?? workoutVolume(w), d.unit)}</span>
      </div>)}
    </div> : <div className="text-center text-label-2 px-5 py-[44px] text-[13px]">No workouts logged.</div>}
  </>
}

function InvitesCard({ invites, reload }) {
  const toast = useUI(s => s.toast)
  const gen = () => api('/api/admin/invites/new', { method: 'POST', body: '{}' })
    .then(({ invite }) => { navigator.clipboard?.writeText(invite.code).catch(() => {}); toast('Code ' + invite.code + ' created & copied'); reload() })
    .catch(e => toast(e.message))
  const revoke = code => api('/api/admin/invites/revoke', { method: 'POST', body: JSON.stringify({ code }) })
    .then(() => { toast('Code revoked'); reload() }).catch(e => toast(e.message))
  const open = (invites || []).filter(i => !i.usedBy)
  const used = (invites || []).filter(i => i.usedBy)
  return <div className="bg-surface rounded-[14px] p-4 mb-3 min-w-0">
    <div className="flex items-center justify-between"><h2 className="text-[13px] font-normal tracking-[-.004em] text-label-2 m-0">Invite codes</h2>
      <Button variant="primary" size="sm" onClick={gen} icon="plus">Generate</Button></div>
    <div className="text-[13px] leading-[1.38] text-label-2 my-1.5 mb-2.5">{open.length} unused · {used.length} redeemed</div>
    {open.map(i => <div key={i.code} className="flex items-center justify-between py-[7px] px-0.5 border-b border-sep">
      <span className="font-mono font-medium tracking-[.06em]" onClick={() => { navigator.clipboard?.writeText(i.code).catch(() => {}); toast('Copied ' + i.code) }}>{i.code}</span>
      <button className="w-8 h-[30px] rounded-lg shrink-0 bg-surface text-[15px] text-red flex items-center justify-center transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => revoke(i.code)} aria-label="revoke"><Icon name="trash" /></button>
    </div>)}
    {used.map(i => <div key={i.code} className="flex items-center justify-between text-label-3 py-[7px] px-0.5" style={{ fontSize: '.8rem' }}>
      <span className="font-mono">{i.code}</span><span>→ {i.usedByName || 'used'}</span>
    </div>)}
    {!open.length && !used.length && <div className="text-label-3 text-[13px] leading-[1.38]">No codes yet — generate one to invite someone.</div>}
  </div>
}

export default function Admin() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const [users, setUsers] = useState(null)
  const [invites, setInvites] = useState(null)
  const [inviteOnly, setInviteOnly] = useState(false)

  const loadUsers = () => api('/api/admin/users').then(d => { setUsers(d.users); setInviteOnly(d.invite_only) }).catch(e => toast(e.message || 'Failed to load'))
  const loadInvites = () => api('/api/admin/invites').then(d => setInvites(d.invites)).catch(() => {})
  // poll every 15s so the "training now" section stays live without a manual refresh
  useEffect(() => { if (!user?.admin) return; loadUsers(); loadInvites(); const iv = setInterval(loadUsers, 15000); return () => clearInterval(iv) }, [])
  if (!user?.admin) return null

  const openUser = id => openSheet(close => <UserDetail id={id} onChanged={loadUsers} close={close} />)
  const liveUsers = (users || []).filter(u => u.live)
  const activeCount = (users || []).filter(u => u.lastSync && Date.now() - u.lastSync < 7 * 86400000).length
  const disabledCount = (users || []).filter(u => u.disabled).length

  return <div className="max-w-[640px] mx-auto desk:max-w-none">
    <div className="flex items-end justify-between gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/settings')} aria-label="Back"><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2"><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em] m-0">Admin</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{users ? users.length + ' users · ' + activeCount + ' active this week' : 'Loading…'}</div></div>
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => { loadUsers(); loadInvites() }} aria-label="refresh">↻</button>
    </div>

    <div className="grid grid-cols-2 gap-2.5 mb-3 desk:grid-cols-4">
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Users</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{users ? users.length : '—'}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Training now</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]" style={{ color: liveUsers.length ? 'var(--acc)' : undefined }}>{users ? liveUsers.length : '—'}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Active 7d</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{users ? activeCount : '—'}</div></div>
      <div className="bg-surface rounded-[14px] p-3.5"><div className="text-label-2 text-[13px] font-normal tracking-[-.004em]">Disabled</div><div className="text-[26px] font-semibold tracking-[-.026em] mt-[5px] leading-[1.1]">{users ? disabledCount : '—'}</div></div>
    </div>

    <div className="desk:grid desk:grid-cols-2 desk:gap-3.5 desk:items-start">
      <div className="min-w-0">
        {liveUsers.length > 0 && <div className="bg-surface rounded-[14px] p-4 mb-3 border border-acc">
          <h2 className="flex items-center gap-1.5 text-[13px] font-normal tracking-[-.004em] text-label-2 m-0 mb-2"><Icon name="dot" className="text-[10px] text-green" />Training now</h2>
          {liveUsers.map(u => <div key={u.id} className="flex items-center justify-between py-2 px-0.5 border-b border-sep cursor-pointer" onClick={() => openUser(u.id)}>
            <div><div className="text-[13px] leading-[1.38] font-semibold">{u.name}</div>
              <div className="text-label-3" style={{ fontSize: '.72rem' }}>{u.live.name} · ex {u.live.exIdx}/{u.live.exTotal} · {u.live.setsDone}/{u.live.setsTotal} sets</div></div>
            <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium">{dur(Date.now() - u.live.startedAt)}</span>
          </div>)}
        </div>}
        <InvitesCard invites={invites} reload={loadInvites} />
      </div>
      <div className="min-w-0">
        <h4 className="text-[13px] font-normal tracking-[-.004em] text-label-2 mt-[22px] mb-2 px-1 desk:mt-0">Users</h4>
        <div className="flex flex-col gap-2">
          {(users || []).map(u => <div key={u.id} className="flex items-center gap-3 bg-surface rounded-[14px] px-3 py-2.5 min-h-[60px] transition-colors duration-150 text-left w-full no-tap active:bg-surface-2 cursor-pointer" onClick={() => openUser(u.id)} style={u.disabled ? { opacity: .55 } : null}>
            <div className="flex-1 min-w-0"><div className="text-[16px] font-normal leading-[1.25] tracking-[-.009em]">{u.live && <Icon name="dot" className="text-[9px] text-green inline-block mr-[5px]" />}{u.name} {u.admin && <span className="inline-flex items-center gap-[3px] bg-acc-soft text-acc rounded-md px-[7px] py-[3px] text-[12px] font-medium ml-1">admin</span>}{u.disabled && <span className="inline-flex items-center gap-[3px] bg-surface-2 rounded-md px-[7px] py-[3px] text-[12px] font-medium ml-1 text-red">off</span>}</div>
              <div className="text-label-2 text-[13px] mt-0.5">{u.live ? 'training now · ' + u.live.name : u.workouts + ' workouts' + (u.lastWorkout ? ' · last ' + fmtDate(u.lastWorkout) : '') + ' · synced ' + rel(u.lastSync)}</div></div>
            {u.hasPush && <Icon name="bell" title="push enabled" className="text-[15px] text-label-3 shrink-0" />}<Icon name="chevronRight" className="text-label shrink-0 text-[15px] [--icon-stroke:2.4]" />
          </div>)}
          {users && !users.length && <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45]">No users yet.</div>}
        </div>
      </div>
    </div>
  </div>
}

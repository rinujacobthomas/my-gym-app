import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, DEF, hasData } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { ACCENTS, todayISO, localTZ } from '../lib/format.js'
import { effortOf } from '../lib/history.js'
import { logoutAll } from '@og/api-client'
import { IS_ANDROID } from '../lib/ua.js'
import { pushSupported, enablePush, disablePush, sendTestPush } from '../lib/push.js'
import { wakeLockSupported } from '../lib/wakelock.js'
import { t, LANGS, INSTR_LANGS } from '../lib/i18n.js'
import { loadStarterPlan, confirmSheet, importFromApp } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, SelectRow, Switch, Segmented, Button, TextField } from '../components/ui.jsx'

// Mobile: one narrow column. Desk (≥1000px): the sections flow into a
// two-column newspaper layout — the header and the footer span the full width.
export default function Settings() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const { update, replaceState, setUser, pullState, pushState, signOut, signOutAll, resetDemo } = useStore()
  const toast = useUI(s => s.toast)
  const fileRef = useRef(null)
  const importRef = useRef(null)
  const wakeOK = wakeLockSupported()

  const doExport = async () => {
    const json = JSON.stringify(S, null, 2)
    const name = 'opengym-backup-' + todayISO() + '.json'
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href)
    toast(t('Backup exported'))
  }
  const doImport = ev => {
    const f = ev.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result)
        if (!data.workouts || !data.routines) throw new Error('not an openGym backup')
        confirmSheet({ title: t('Import backup?'), message: t('This replaces all current data with the backup file.'), confirmText: t('Import'), danger: true, onConfirm: () => { replaceState(Object.assign(JSON.parse(JSON.stringify(DEF)), data), true); toast(t('Backup imported')) } })
      } catch (e) { toast(t('Import failed: {0}', e.message)) }
    }
    rd.readAsText(f)
  }
  // Ends the profile's sessions on every device — this one included, so on success it lands in
  // the same place as the plain sign-out above (home, local data cleared). On failure nothing
  // local is touched: still signed in here, and say so rather than leaving a half-signed-out app.
  const signOutEverywhere = () => confirmSheet({
    title: t('Sign out everywhere?'),
    message: t('Signs this profile out on every device, including this one. Sign in with Google again anytime.'),
    confirmText: t('Sign out everywhere'), danger: true,
    onConfirm: async () => {
      try { await signOutAll(); nav('/home'); toast(t('Signed out on all devices')) }
      catch (e) { toast(t('Could not sign out everywhere — you are still signed in.')) }
    },
  })

  return <div className="max-w-[640px] mx-auto desk:max-w-none desk:[column-count:2] desk:[column-gap:14px]">
    <div className="flex items-end gap-3 mt-2 mb-[18px] desk:[column-span:all]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5"><h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Settings')}</h1></div>
    </div>

    {/* ---------- account ---------- */}
    <Section title={t('Account')} className="desk:[break-inside:avoid]">
      {user ? <>
        <Row icon="personCircle" iconTint="var(--grey)" title={user.name} subtitle={user.email} />
        <Row icon="signOut" iconTint="var(--red)" title={t('Sign out')} danger onClick={() => confirmSheet({ title: t('Sign out?'), message: t('Your data is synced to your profile first, then cleared from this device.'), confirmText: t('Sign out'), danger: true, onConfirm: () => { signOut(); nav('/home') } })} />
        <Row icon="shield" iconTint="var(--red)" title={t('Sign out everywhere')} subtitle={t('Ends this account’s sessions on all your devices.')} danger onClick={signOutEverywhere} />
      </> : (
        <Row icon="lock" iconTint="var(--grey)" title={t('Not signed in.')} />
      )}
    </Section>

    {/* ---------- general ---------- */}
    <Section title={t('General')} footer={t('Note: switching units only changes the label — logged numbers are not converted.')} className="desk:[break-inside:avoid]">
      <SelectRow
        icon="globe" iconTint="var(--blue)" title={t('Language')}
        value={S.lang || 'en'} onChange={v => update(s => { s.lang = v })}
        options={Object.entries(LANGS).map(([k, name]) => ({
          value: k, label: name,
          subtitle: INSTR_LANGS.includes(k) ? null : t("Exercise instructions aren't available in this language yet — they stay in English."),
        }))}
      />
      <Row icon="scale" iconTint="var(--teal)" title={t('Weight unit')}>
        <Segmented className="seg-inline shrink-0 min-w-[132px]"
          options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
          value={S.unit} onChange={v => update(s => { s.unit = v })} />
      </Row>
    </Section>

    {/* ---------- during a workout ---------- */}
    <Section title={t('During a workout')} footer={wakeOK ? t('The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.') : null} className="desk:[break-inside:avoid]">
      <SelectRow icon="timer" iconTint="var(--orange)" title={t('Rest timer')}
        value={S.restSec} onChange={v => update(s => { s.restSec = v })}
        options={[60, 90, 120, 150, 180].map(v => ({ value: v, label: v + 's' }))} />
      {wakeOK && (
        <Row icon="sun" iconTint="var(--yellow)" title={t('Keep screen awake')}
          subtitle={wakeOK ? null : t('Not supported in this browser.')}>
          <Switch checked={wakeOK && S.keepAwake !== false} disabled={!wakeOK}
            onChange={v => update(s => { s.keepAwake = v })} />
        </Row>
      )}
      <Row icon="bell" iconTint="var(--pink)" title={t('Sounds')}>
        <Switch checked={!!S.sound} onChange={v => update(s => { s.sound = v })} />
      </Row>
      {/* Two names for the same judgement, so the column asks in the scale you already think in.
          The (i) sits before the control — you read it on the way to the choice, not after it. */}
      <Row icon="target" iconTint="var(--purple)" title={t('Effort per set')}>
        <button className="text-label-3 text-[16px] bg-transparent leading-none shrink-0 -my-[11px] -ml-1 -mr-0.5 px-1 py-[11px] no-tap active:text-label" aria-label={t('What are RIR and RPE?')} onClick={effortHelpSheet}><Icon name="info" /></button>
        <Segmented className="seg-inline shrink-0 min-w-[132px]"
          options={[{ value: 'none', label: t('Off') }, { value: 'rir', label: t('RIR') }, { value: 'rpe', label: t('RPE') }]}
          value={effortOf(S)} onChange={v => update(s => { s.effort = v; delete s.showRir })} />
      </Row>
    </Section>

    {user && <NotificationsCard S={S} update={update} toast={toast} />}

    {/* ---------- appearance ---------- */}
    <Section title={t('Appearance')} footer={user ? t('synced with your profile') : undefined} className="desk:[break-inside:avoid]">
      <Row icon="moon" iconTint="var(--indigo)" title={t('Theme')}>
        <Segmented
          className="seg-inline shrink-0 min-w-[132px]"
          options={[{ value: 'dark', icon: 'moon', label: t('Dark') }, { value: 'light', icon: 'sun', label: t('Light') }]}
          value={S.theme === 'light' ? 'light' : 'dark'}
          onChange={v => update(s => { s.theme = v })}
        />
      </Row>
      {/* Purely how the muscle map is drawn — nothing else in the app reads this. */}
      <Row icon="figureStrength" iconTint="var(--teal)" title={t('Body diagram')}>
        <Segmented
          className="seg-inline shrink-0 min-w-[132px]"
          options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]}
          value={S.body === 'female' ? 'female' : 'male'}
          onChange={v => update(s => { s.body = v })}
        />
      </Row>
      <div className="lrow relative flex flex-col gap-3 px-3.5 pt-[13px] pb-3.5 min-h-[46px] text-label bg-transparent">
        <span className="text-[17px] tracking-[-.012em] leading-[1.25]">{t('Accent color')}</span>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(ACCENTS).map(([k, c]) => (
            <button key={k} className={'relative w-8 h-8 rounded-full shrink-0 no-tap transition-transform duration-150 active:scale-90 ' + ((S.accent || 'red') === k ? 'after:content-[\'\'] after:absolute after:-inset-1 after:rounded-full after:shadow-[0_0_0_2px_var(--label)]' : '')}
              style={{ background: c }} onClick={() => update(s => { s.accent = k })} aria-label={k} />
          ))}
        </div>
      </div>
    </Section>

    {/* ---------- data: fill it, bring things over, back it up, wipe it ---------- */}
    <Section title={t('Data')} className="desk:[break-inside:avoid]">
      <Row icon="sparkles" iconTint="var(--acc)" title={t('Use the ready-made plan (Push / Pull / Legs)')} accessory="chevron" onClick={loadStarterPlan} />
      <Row icon="shuffle" iconTint="var(--teal)" title={t('Import from another app')}
        subtitle={t('FitNotes, Strong, Hevy — or body weight from Apple Health')}
        accessory="chevron" onClick={() => importRef.current.click()} />
      <Row icon="upload" iconTint="var(--blue)" title={t('Import backup')} accessory="chevron" onClick={() => fileRef.current.click()} />
      <Row icon="download" iconTint="var(--blue)" title={t('Export backup (JSON)')} accessory="chevron" onClick={doExport} />
      <Row icon="trash" iconTint="var(--red)" title={t('Reset everything')} danger onClick={() => confirmSheet({ title: t('Reset everything?'), message: t('Deletes your plan, workouts and body weight on this device. This cannot be undone.'), confirmText: t('Delete everything'), danger: true, onConfirm: () => { replaceState(JSON.parse(JSON.stringify(DEF)), true); nav('/home'); toast(t('All data reset')) } })} />
    </Section>
    <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={doImport} />
    {/* Reset after reading so picking the same file twice still fires onChange. */}
    <input ref={importRef} type="file" accept=".csv,.xml,text/csv,text/xml" style={{ display: 'none' }}
      onChange={ev => { const f = ev.target.files[0]; if (f) importFromApp(f); ev.target.value = '' }} />

    <Section title={t('Tip')} className="desk:[break-inside:avoid]">
      <Row icon="lightbulb" iconTint="var(--yellow)"
        title={IS_ANDROID ? t('In Chrome: ⋮ menu → Add to Home screen') : t('In Safari: Share → Add to Home Screen')}
        subtitle={t('to install openGym as a full-screen app.') + ' ' + t('Your data syncs with your profile — sign in anywhere to see it.')} />
    </Section>

    <div className="text-label-3 text-[13px] leading-[1.38] text-center mt-1 leading-[1.6] desk:[column-span:all]">
      openGym · {t('free & open source (AGPL v3)')}<br />
      <a href="https://github.com/DuarteSantos8/openGym" target="_blank" rel="noopener">source code</a> · exercise data: hasaneyldrm/exercises-dataset (CC)
    </div>
  </div>
}

// The whole point is that the two scales are one judgement counted from opposite ends, and a
// paragraph is a bad way to say that — the conversion table shows it in one look. Reading down
// a column is the answer to "what do I put here", so the numbers get their own aligned columns.
const EFFORT_ROWS = [
  ['0', '10', 'Nothing left — went to failure'],
  ['1', '9', 'One more rep in the tank'],
  ['2', '8', 'Two more reps'],
  ['3', '7', 'Three more reps'],
  ['4+', '≤6', 'Easy — warm-up territory'],
]
// RIR 2 / RPE 8: the row a working set usually lands on — the anchor the others are read
// against. Not where the stepper starts; + walks up from the bottom of the scale.
const EFFORT_TYPICAL = 2

function effortHelpSheet() {
  useUI.getState().openSheet(close => <>
    <h3 className="text-[20px] font-semibold tracking-[-.021em] mb-3.5">{t('Effort per set')}</h3>
    <div className="text-label-2 text-[13px] leading-[1.5]">
      {t('How hard a set was, logged next to weight and reps. Two scales for the same judgement, counted from opposite ends.')}
    </div>
    <div className="bg-surface rounded-2xl overflow-hidden mt-3.5 mb-3">
      <div className="flex items-center gap-2.5 px-3.5 pt-2 pb-2 bg-surface-2">
        <span className="w-9 shrink-0 text-center text-[11px] font-semibold tracking-[.05em] uppercase text-label-3">{t('RIR')}</span>
        <span className="w-9 shrink-0 text-center text-[11px] font-semibold tracking-[.05em] uppercase text-label-3">{t('RPE')}</span>
        <span className="flex-1 min-w-0 text-[11px] font-semibold tracking-[.05em] uppercase text-label-3">{t('How it felt')}</span>
      </div>
      {EFFORT_ROWS.map(([rir, rpe, feel], i) => (
        <div key={rir} className={'relative flex items-center gap-2.5 px-3.5 py-2.5 ' + (i > 0 ? 'before:content-[\'\'] before:absolute before:left-3.5 before:right-0 before:top-0 before:h-[0.5px] before:bg-sep ' : '') + (i === EFFORT_TYPICAL ? 'bg-acc-soft' : '')}>
          <span className={'w-9 shrink-0 text-center text-[17px] font-semibold tracking-[-.02em] tabular-nums ' + (i === EFFORT_TYPICAL ? 'text-acc' : '')}>{rir}</span>
          <span className={'w-9 shrink-0 text-center text-[17px] font-semibold tracking-[-.02em] tabular-nums ' + (i === EFFORT_TYPICAL ? 'text-acc' : '')}>{rpe}</span>
          <span className={'flex-1 min-w-0 text-[15px] leading-[1.3] ' + (i === EFFORT_TYPICAL ? 'text-label' : 'text-label-2')}>{t(feel)}</span>
        </div>
      ))}
    </div>
    <div className="text-label-3 text-[13px] leading-[1.5] grid gap-2">
      <div>{t('RIR counts the reps you left; RPE reads the same effort off a 10-point scale — so RPE ≈ 10 − RIR. Pick the one you already think in.')}</div>
      <div>{t('The highlighted row is where most working sets land. Sets you have already logged keep their own scale, and nothing else reads the value — progression and estimated 1RM are unaffected.')}</div>
    </div>
    <div className="h-2" />
  </>)
}

function NotificationsCard({ S, update, toast }) {
  return <PushCard S={S} update={update} toast={toast} />
}

function PushCard({ S, update, toast }) {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const supported = pushSupported()

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => setOn(!!sub)).catch(() => {})
  }, [supported])

  const toggle = async v => {
    setBusy(true)
    try {
      if (!v) { await disablePush(); setOn(false); toast(t('Notifications off')) }
      else { await enablePush(); setOn(true); toast(t('Notifications on')) }
    } catch (e) { toast(e.message || t('Could not change notification settings')) }
    setBusy(false)
  }
  const test = async () => {
    try { await sendTestPush(); toast(t('Test sent — should arrive any second')) }
    catch (e) { toast(e.message || t('Test failed')) }
  }

  if (!supported) return (
    <Section title={t('Notifications')} className="desk:[break-inside:avoid]">
      <Row icon="bellSlash" iconTint="var(--grey)" title={t('Not supported in this browser.')} />
    </Section>
  )

  return <>
    <Section
      title={t('Notifications')}
      footer={on && S.reminder?.on
        ? t("Only sent on days you have a routine planned and haven't logged a workout yet.") +
          (S.reminder?.tz ? ' ' + t('Timezone: {0} (auto-detected, updates if you travel).', S.reminder.tz) : '')
        : null}
      className="desk:[break-inside:avoid]"
    >
      <Row icon="bell" iconTint="var(--red)" title={t('Push notifications')} subtitle={t('Rest-timer alerts, even if openGym is closed.')}>
        <Switch checked={on} disabled={busy} onChange={toggle} />
      </Row>
      {on && (
        <Row icon="calendar" iconTint="var(--orange)" title={t('Workout day reminder')}>
          <Switch checked={!!S.reminder?.on} onChange={() => update(s => { s.reminder = { ...(s.reminder || DEF.reminder), on: !s.reminder?.on, tz: localTZ() } })} />
        </Row>
      )}
      {on && S.reminder?.on && (
        <Row icon="clock" iconTint="var(--purple)" title={t('Reminder time')}>
          <input type="time" className="bg-surface-2 border-0 rounded-lg px-2.5 py-1.5 text-[16px] text-label outline-none tabular-nums" value={S.reminder?.time || DEF.reminder.time}
            onChange={e => update(s => { s.reminder = { ...(s.reminder || DEF.reminder), time: e.target.value, tz: localTZ() } })} />
        </Row>
      )}
    </Section>
    {on && <div className="-mt-3 mb-[22px] desk:[break-inside:avoid]"><Button size="sm" icon="bell" onClick={test}>{t('Send test notification')}</Button></div>}
  </>
}

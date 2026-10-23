import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, qk } from '@og/api-client'
import { useUI } from '../store/useUI.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Section, Stepper } from '../components/ui.jsx'

const fmtINR = paise => '₹' + (Math.round(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

const STATUS = {
  ACTIVE: { color: 'var(--green)', label: 'Active' },
  EXPIRING: { color: 'var(--orange)', label: 'Expiring soon' },
  GRACE: { color: 'var(--yellow)', label: 'Grace period' },
  EXPIRED: { color: 'var(--red)', label: 'Expired' },
  FROZEN: { color: 'var(--teal)', label: 'Frozen' },
}
const statusOf = m => STATUS[m && m.status] || null

function Ring({ value, max, size = 116, stroke = 11, color }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return <svg width={size} height={size} className="-rotate-90 shrink-0">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
      style={{ transition: 'stroke-dashoffset .4s var(--ease)' }} />
  </svg>
}

function StatusChip({ m }) {
  const s = statusOf(m)
  if (!s) return null
  return <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium"
    style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 16%, transparent)` }}>{t(s.label)}</span>
}

let rzpLoading = null
const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve()
  if (!rzpLoading) {
    rzpLoading = new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload = res
      s.onerror = () => { rzpLoading = null; rej(new Error('checkout script failed to load')) }
      document.head.appendChild(s)
    })
  }
  return rzpLoading
}

export default function Membership() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const qc = useQueryClient()
  const memQ = useQuery({ queryKey: qk.membership, queryFn: () => api('/api/membership/me') })
  const plansQ = useQuery({ queryKey: qk.plans, queryFn: () => api('/api/plans') })
  const paysQ = useQuery({ queryKey: qk.paymentsMe, queryFn: () => api('/api/payments/me') })
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(null)
  const plansRef = useRef(null)
  const m = memQ.data
  const st = statusOf(m)
  const activeish = st && ['ACTIVE', 'EXPIRING', 'GRACE'].includes(m.status)
  const frozen = st && m.status === 'FROZEN'
  const member = activeish || frozen   // has days on the clock — buying adds to them

  const buy = async plan => {
    if (busy) return
    setBusy(plan.id)
    try {
      const o = await api('/api/payments/order', { method: 'POST', body: JSON.stringify({ planId: plan.id }) })
      await loadRazorpay()
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#ff453a'
      new window.Razorpay({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amountPaise,
        currency: 'INR',
        name: 'openGym',
        description: o.planName || plan.name,
        theme: { color: acc },
        handler: resp => {
          api('/api/payments/verify', {
            method: 'POST',
            body: JSON.stringify({ orderId: o.orderId, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
          })
            .then(() => {
              toast(t('Payment successful — welcome aboard 💪'))
              qc.invalidateQueries({ queryKey: qk.membership })
              qc.invalidateQueries({ queryKey: qk.paymentsMe })
            })
            .catch(() => toast(t('Verification failed — please contact the desk')))
        },
        modal: { ondismiss: () => toast(t('Payment cancelled')) },
      }).open()
    } catch (e) {
      toast(e.status === 503
        ? t('Online payment is not available at this gym yet — please pay at the front desk.')
        : t('Could not start checkout: {0}', e.message))
    } finally { setBusy(null) }
  }

  const doFreeze = async () => {
    if (busy === 'freeze') return
    setBusy('freeze')
    try {
      await api('/api/membership/freeze', { method: 'POST', body: JSON.stringify({ days }) })
      toast(t('Membership paused — slots you had booked during the pause were released.'))
      qc.invalidateQueries({ queryKey: qk.membership })
      qc.invalidateQueries({ queryKey: qk.myBookings })
      qc.invalidateQueries({ queryKey: ['slots'] })
    } catch (e) {
      toast(e.status === 409 ? t('No freezes left on this plan.') : t('Could not freeze: {0}', e.message))
    } finally { setBusy(null) }
  }

  const doUnfreeze = async () => {
    if (busy === 'unfreeze') return
    setBusy('unfreeze')
    try {
      await api('/api/membership/unfreeze', { method: 'POST' })
      toast(t('Welcome back — membership resumed'))
      qc.invalidateQueries({ queryKey: qk.membership })
    } catch (e) {
      toast(t('Could not unfreeze: {0}', e.message))
    } finally { setBusy(null) }
  }

  const totalDays = m && m.startDate && m.endDate ? Math.max(1, Math.round((new Date(m.endDate) - new Date(m.startDate)) / 86400000)) : 1
  const daysLeft = m && typeof m.daysLeft === 'number' ? Math.max(0, m.daysLeft) : 0

  return <div>
    <div className="flex items-end gap-3 mt-2 mb-[18px]">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="flex-1 ml-2.5">
        <h1 className="text-[34px] leading-[1.06] font-bold tracking-[-.028em]">{t('Membership')}</h1>
        <div className="text-label-2 text-[15px] tracking-[-.006em] mt-1">{t('Plans, freezes & payments')}</div>
      </div>
    </div>

    {memQ.isPending && <div className="h-40 bg-surface rounded-xl animate-pulse mb-3" />}

    {!memQ.isPending && m && !st && <div className="bg-surface rounded-[14px] p-5 mb-3">
      <div className="flex items-center gap-2.5 mb-1">
        <Icon name="personCircle" className="text-label-3 text-[20px]" />
        <h2 className="text-[22px] font-semibold tracking-[-.021em] leading-[1.1] flex-1">{t('No membership yet')}</h2>
      </div>
      <div className="text-label-2 text-[13px] leading-[1.38]">{t('Pick a plan below to get started — your days start the day you buy.')}</div>
    </div>}

    {!memQ.isPending && m && st && <>
      {frozen ? <div className="rounded-[14px] p-5 mb-3 bg-[color-mix(in_srgb,var(--teal)_12%,var(--surface))]">
        <div className="flex items-center gap-2.5 mb-1">
          <Icon name="pause" className="text-teal text-[20px]" />
          <h2 className="text-[22px] font-semibold tracking-[-.021em] leading-[1.1] flex-1">{t('Membership frozen')}</h2>
          <StatusChip m={m} />
        </div>
        <div className="text-label-2 text-[13px] leading-[1.38]">
          {m.frozenUntil ? t('Paused until {0}. Resume anytime — your days keep counting when you are back.', fmtDate(m.frozenUntil, true)) : t('Paused. Resume anytime — your days keep counting when you are back.')}
        </div>
        <div className="mt-3"><Button size="sm" variant="tinted" icon="play" disabled={busy === 'unfreeze'} onClick={doUnfreeze}>{t('Unfreeze now')}</Button></div>
      </div>
        : m.status === 'EXPIRED' || !m.endDate ? <div className="rounded-[14px] p-5 mb-3 bg-[color-mix(in_srgb,var(--red)_12%,var(--surface))]">
          <div className="flex items-center gap-2.5 mb-1">
            <Icon name="lock" className="text-red text-[20px]" />
            <h2 className="text-[22px] font-semibold tracking-[-.021em] leading-[1.1] flex-1">{t('Membership expired')}</h2>
            <StatusChip m={m} />
          </div>
          <div className="text-label-2 text-[13px] leading-[1.38]">
            {m.endDate ? t('Expired on {0}. Pick a plan below to get back in.', fmtDate(m.endDate, true)) : t('You don\'t have an active membership yet.')}
          </div>
          <div className="mt-3"><Button size="sm" variant="primary" trailingIcon="chevronDown" onClick={() => plansRef.current && plansRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t('Browse plans')}</Button></div>
        </div>
          : <div className="bg-surface rounded-[14px] p-5 mb-3">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <Ring value={daysLeft} max={totalDays} color={st.color} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-[26px] font-semibold tracking-[-.026em] leading-none">{fmtNum(daysLeft)}</div>
                  <div className="text-label-3 text-[11px] mt-1">{t('days left')}</div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[22px] font-semibold tracking-[-.021em] leading-[1.1]">{m.planName || t('Membership')}</h2>
                  <StatusChip m={m} />
                </div>
                <div className="text-label-2 text-[13px] leading-[1.38] mt-1">
                  {m.status === 'GRACE'
                    ? t('Renew during grace to keep your streak and access.')
                    : m.endDate ? t('Valid till {0}', fmtDate(m.endDate, true)) : ''}
                </div>
                {st.label === 'EXPIRING' && <div className="text-orange text-[13px] leading-[1.38] mt-1.5 flex items-center gap-1.5">
                  <Icon name="bell" className="text-[14px]" />{t('Running out soon — renew below')}
                </div>}
              </div>
            </div>
          </div>}

      {activeish && <Section title={t('Freeze')} className="mb-3"
        footer={t('Going away? Pause your membership — your end date moves back by the same number of days, so you lose nothing.')}>
        {frozen ? null : <div className="p-3.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-[150px] shrink-0">
              <Stepper value={days} step={1} decimal={false} unit={t('days')}
                onChange={v => setDays(Math.min(m.freezeMaxDays || 30, Math.max(1, Math.round(v) || 1)))} />
            </div>
            <Button size="sm" variant="tinted" icon="pause" disabled={busy === 'freeze'} onClick={doFreeze}>{t('Freeze for {0} days', days)}</Button>
          </div>
          {typeof m.freezesUsed === 'number' && <div className="text-label-3 text-[13px] leading-[1.38] mt-2.5">
            {t('{0} of {1} freezes used', m.freezesUsed, typeof m.freezesMax === 'number' ? m.freezesMax : '—')}
          </div>}
        </div>}
      </Section>}
    </>}

    <div ref={plansRef}>
      <h2 className="block text-[13px] font-normal text-label-2 tracking-[-.004em] px-1 pb-[7px]">{t('Plans')}</h2>
      {member && <p className="text-[13px] text-label-2 leading-[1.38] px-1 pb-2 -mt-1">{t('Paying now adds the days on top of your current end date — you never lose days by renewing early.')}</p>}
      {plansQ.isPending && <><div className="h-24 bg-surface rounded-xl animate-pulse mb-2" /><div className="h-24 bg-surface rounded-xl animate-pulse mb-2" /></>}
      {plansQ.error && !plansQ.isPending && <div className="bg-surface rounded-[14px] p-5 text-center">
        <div className="text-label-2 text-[13px] mb-2.5">{t('Could not load plans.')}</div>
        <Button size="sm" variant="tinted" icon="reset" onClick={() => plansQ.refetch()}>{t('Retry')}</Button>
      </div>}
      <div className="grid gap-2 desk:grid-cols-3">
        {(plansQ.data || []).map(p => (
          <div key={p.id} className="bg-surface rounded-[14px] p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[19px] font-semibold tracking-[-.021em] leading-[1.15]">{p.name}</div>
              {m && m.planName === p.name && activeish && <span className="inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium text-green bg-[color-mix(in_srgb,var(--green)_16%,transparent)] shrink-0">{t('Current')}</span>}
            </div>
            <div className="mt-1.5 baseline">
              <span className="text-[26px] font-semibold tracking-[-.026em] leading-[1.1]">{fmtINR(p.pricePaise)}</span>
              <span className="text-label-2 text-[13px] ml-1.5">/ {t('{0} days', p.durationDays)}</span>
            </div>
            {p.description && <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5 flex-1">{p.description}</div>}
            <div className="mt-3">
              <Button size="sm" variant={member ? 'plain' : 'primary'} disabled={busy === p.id} onClick={() => buy(p)}>
                {member ? (m.planName === p.name ? t('Renew') : t('Switch to this plan')) : t('Buy')}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {!plansQ.isPending && !(plansQ.data || []).length && !plansQ.error && <div className="bg-surface rounded-[14px] p-6 text-center">
        <Icon name="crown" className="text-[26px] text-label-3" />
        <div className="text-label-2 text-[13px] leading-[1.38] mt-2">{t('No plans published yet — check back soon.')}</div>
      </div>}
    </div>

    <Section title={t('Payment history')} className="mt-6">
      {(paysQ.data || []).length ? (paysQ.data || []).map(p => {
        const s = String(p.status || '').toUpperCase()
        const good = ['CAPTURED', 'PAID', 'SUCCESS', 'SUCCESSFUL'].includes(s)
        const bad = ['FAILED', 'CANCELLED'].includes(s)
        return <div key={p.id} className="lrow relative flex items-center gap-3 px-3.5 py-[11px] min-h-[52px]">
          <div className="flex-1 min-w-0">
            <div className="text-[17px] tracking-[-.012em] leading-[1.25] truncate">{p.planName || t('Membership')}</div>
            <div className="text-label-3 text-[13px] leading-[1.3] mt-px">
              {p.paidAt || p.createdAt ? fmtDate(p.paidAt || p.createdAt, true) : ''}{p.method ? ' · ' + String(p.method).toLowerCase() : ''}
            </div>
          </div>
          <span className={'inline-flex rounded-md px-[7px] py-[3px] text-[12px] font-medium shrink-0 ' + (good ? 'text-green bg-[color-mix(in_srgb,var(--green)_16%,transparent)]' : bad ? 'text-red bg-[color-mix(in_srgb,var(--red)_15%,transparent)]' : 'text-yellow bg-[color-mix(in_srgb,var(--yellow)_18%,transparent)]')}>{s || t('PENDING')}</span>
          <span className="text-[17px] font-semibold tracking-[-.012em] shrink-0">{fmtINR(p.amountPaise)}</span>
        </div>
      }) : <div className="px-3.5 py-5 text-center">
        <Icon name="clipboard" className="text-[24px] text-label-3 mx-auto" />
        <div className="text-label-2 text-[13px] leading-[1.38] mt-1.5">{paysQ.isPending ? t('Loading…') : t('No payments yet.')}</div>
      </div>}
    </Section>

    <div className="h-2" />
  </div>
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { api } from '../lib/api.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'

export default function QrCode() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const codeQ = useQuery({
    queryKey: ['bookings', 'checkin-code'],
    queryFn: () => api('/api/bookings/checkin-code'),
    staleTime: 60_000,
  })
  const [img, setImg] = useState(null)
  const [today, setToday] = useState(new Date())
  const code = codeQ.data ? codeQ.data.code : null

  useEffect(() => {
    if (!code) return
    let dead = false
    QRCode.toDataURL(code, { margin: 2, scale: 8, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(u => { if (!dead) setImg(u) })
      .catch(() => { if (!dead) toast(t('Could not render the QR code')) })
    return () => { dead = true }
  }, [code, toast])

  useEffect(() => {
    const n = new Date()
    const mid = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0, 50)
    const tm = setTimeout(() => {
      setImg(null)
      setToday(new Date())
      codeQ.refetch()
    }, mid.getTime() - n.getTime())
    return () => clearTimeout(tm)
  }, [codeQ.refetch])

  return <div className="fixed inset-0 z-[80] bg-bg flex flex-col items-center px-6 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-[calc(env(safe-area-inset-bottom,0px)+28px)]">
    <div className="w-full max-w-[560px] flex items-center justify-between">
      <button className="w-9 h-9 rounded-full shrink-0 bg-surface text-label flex items-center justify-center text-[18px] transition-[background-color,transform] duration-150 active:bg-surface-2 active:scale-90 no-tap" onClick={() => nav(-1)} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="text-label-2 text-[15px] tracking-[-.006em]">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <span className="w-9 h-9" />
    </div>

    <div className="flex-1 w-full max-w-[560px] flex flex-col items-center justify-center gap-6 -mt-8">
      <div className="bg-white rounded-[28px] p-5 shadow-[0_20px_60px_-12px_rgba(0,0,0,.5)]">
        {img
          ? <img src={img} width="248" height="248" alt={t('Check-in code')} className="block rounded-lg" />
          : <div className="w-[248px] h-[248px] bg-black/5 rounded-lg animate-pulse" />}
      </div>

      <div className="flex items-center gap-2 text-label-2 text-[13px] leading-[1.38] max-w-[300px] text-center">
        <Icon name="sun" className="text-yellow shrink-0 text-[16px]" />
        <span>{t('Turn up your screen brightness so the scanner can read it.')}</span>
      </div>

      <div className="text-center w-full">
        {code
          ? <div className="font-mono text-[22px] tracking-[.18em] select-all break-all px-4">{code}</div>
          : <div className="h-7 w-40 mx-auto bg-surface rounded-lg animate-pulse" />}
        <button className="inline-flex items-center gap-1.5 mt-3 text-acc text-[15px] active:opacity-50 no-tap"
          onClick={() => { setImg(null); codeQ.refetch() }}>
          <Icon name="reset" className="text-[14px]" />
          {t('Refresh')}
        </button>
        <div className="text-label-3 text-[13px] leading-[1.38] mt-2">{t('Refreshes automatically at midnight')}</div>
      </div>
    </div>
  </div>
}

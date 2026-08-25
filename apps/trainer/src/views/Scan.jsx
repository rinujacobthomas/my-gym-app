import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Html5Qrcode } from 'html5-qrcode'
import { checkInScan } from '@og/api-client'
import Icon from '@og/ui'
import { TextField } from '@og/ui'
import { PageHead, BusyBtn, errText } from '../components/bits.jsx'

const MODE_LABEL = { booked: 'Booked slot', walkin: 'Walk-in', already: 'Already checked in' }
const norm = v => String(v || '').trim().toUpperCase()

export default function Scan() {
  const [cam, setCam] = useState('idle')
  const [camErr, setCamErr] = useState(null)
  const [result, setResult] = useState(null)
  const [manual, setManual] = useState('')

  const scannerRef = useRef(null)
  const timerRef = useRef(null)
  const busyRef = useRef(false)
  const lastRef = useRef({ code: '', at: 0 })

  const flash = r => {
    setResult(r)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setResult(null), 2500)
  }

  const checkInMut = useMutation({
    mutationFn: code => checkInScan(code),
    onSuccess: r => flash({ ok: true, title: r.member?.name || 'Member', sub: MODE_LABEL[r.mode] || 'Checked in' }),
    onError: e => flash({ ok: false, title: 'Check-in failed', sub: errText(e) }),
    onSettled: () => {
      busyRef.current = false
      setManual('')
    },
  })

  const submit = raw => {
    const code = norm(raw)
    if (!code || busyRef.current) return
    busyRef.current = true
    checkInMut.mutate(code)
  }

  const onDecode = text => {
    if (busyRef.current) return
    const now = Date.now()
    if (lastRef.current.code === text && now - lastRef.current.at < 2500) return
    lastRef.current = { code: text, at: now }
    submit(text)
  }

  const startCam = async () => {
    setCam('starting')
    setCamErr(null)
    try {
      const h = new Html5Qrcode('qr-reader', { verbose: false })
      scannerRef.current = h
      await h.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 230, height: 230 } },
        onDecode,
        () => { /* per-frame decode misses are normal noise */ },
      )
      setCam('on')
    } catch (e) {
      setCam('err')
      const msg = String(e?.message || e || '')
      setCamErr(/permission|NotAllowed/i.test(msg)
        ? 'Camera permission was denied. Allow camera access in your browser settings, or use manual entry below.'
        : 'Could not start the camera' + (msg ? ' — ' + msg : '') + '. Use manual entry below.')
    }
  }

  useEffect(() => () => {
    const h = scannerRef.current
    if (h) h.stop().then(() => h.clear()).catch(() => {})
    clearTimeout(timerRef.current)
  }, [])

  return (
    <div className="max-w-[560px] mx-auto">
      <PageHead title="Check-in" sub="Scan a member's code" />

      <div className="relative rounded-[20px] overflow-hidden bg-black aspect-square max-h-[420px] w-full mx-auto mb-4">
        <div id="qr-reader" className="absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover [&_img]:hidden" />

        {cam !== 'on' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {cam === 'err' ? (
              <>
                <div className="text-[34px] text-red"><Icon name="bellSlash" /></div>
                <p className="text-[13.5px] text-label-2 leading-[1.45] m-0">{camErr}</p>
                <button onClick={startCam} className="text-acc text-[14px] font-medium bg-transparent border-0 no-tap active:opacity-60">Try again</button>
              </>
            ) : cam === 'starting' ? (
              <>
                <Icon name="reset" className="text-[30px] text-label-2 animate-spin" />
                <p className="text-label-3 text-[13px] m-0">Starting camera…</p>
              </>
            ) : (
              <>
                <div className="text-[40px] text-label-3"><Icon name="target" /></div>
                <p className="text-label-3 text-[13.5px] m-0 max-w-[260px]">Point the camera at the member's QR code.</p>
                <BusyBtn onClick={startCam} icon="target" className="max-w-[220px]">Start camera</BusyBtn>
              </>
            )}
          </div>
        )}

        {cam === 'on' && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[58%] aspect-square pointer-events-none">
            <span className="absolute inset-0 rounded-2xl border-[2.5px] border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
            <span className="absolute left-3 right-3 top-1/2 h-[2px] bg-red/90" />
          </div>
        )}
      </div>

      <div className={'rounded-[16px] px-4 py-4 flex items-center gap-3 transition-opacity duration-200 mb-5 ' +
        (result ? 'opacity-100 ' : 'opacity-0 pointer-events-none h-0 py-0 mb-0 overflow-hidden ') +
        (result?.ok
          ? 'bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-green'
          : 'bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-red')}>
        {result && (
          <>
            <Icon name={result.ok ? 'checkCircle' : 'xmark'} className="text-[34px] shrink-0" />
            <div className="min-w-0">
              <div className="text-[18px] font-semibold tracking-[-.02em] truncate">{result.title}</div>
              <div className="text-[13.5px] opacity-80 truncate">{result.sub}</div>
            </div>
          </>
        )}
      </div>

      <form className="flex gap-2 items-start"
        onSubmit={e => { e.preventDefault(); submit(manual) }}>
        <TextField
          className="flex-1 font-mono uppercase tracking-[.04em]"
          placeholder="Manual code · XXXX-XXXX-XXXX-XXXX"
          value={manual}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          onChange={e => setManual(e.target.value)} />
        <BusyBtn busy={checkInMut.isPending} disabled={!norm(manual)} className="shrink-0 px-5">Check in</BusyBtn>
      </form>
      <p className="text-label-3 text-[12.5px] mt-2 px-1 leading-[1.45]">
        Members find today's code under Check-in in the openGym app. Codes rotate daily.
      </p>
    </div>
  )
}

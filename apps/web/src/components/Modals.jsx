import { useEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'

// One bottom sheet (or centered dialog) with swipe-to-dismiss.
function Sheet({ sheet }) {
  const { closeSheet } = useUI()
  const ref = useRef(null)
  const drag = useRef({ startY: null, delta: 0 })

  const onTouchStart = e => {
    const el = ref.current
    // a gesture that begins on a slider (or opted-out control) belongs to that control,
    // not to the sheet's swipe-to-dismiss — so it keeps working while you drag
    if (e.target.closest && e.target.closest('input[type=range], [data-nodrag]')) {
      drag.current = { startY: null, delta: 0 }
      return
    }
    drag.current = { startY: el.scrollTop <= 0 ? e.touches[0].clientY : null, delta: 0 }
  }
  const onTouchMove = e => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    d.delta = e.touches[0].clientY - d.startY
    if (d.delta > 0 && el.scrollTop <= 0) {
      e.preventDefault()
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  const onTouchEnd = () => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    el.style.transition = 'transform .2s'
    if (d.delta > 90 && !sheet.locked) { el.style.transform = 'translateY(110%)'; setTimeout(() => closeSheet(sheet.id), 180) }
    else el.style.transform = ''
    d.startY = null
  }

  // non-passive touchmove so preventDefault works (bottom sheets only; centered dialogs have no ref)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const close = () => closeSheet(sheet.id)
  if (sheet.kind === 'center') {
    return (
      <div>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] touch-none overscroll-none" onClick={() => { if (!sheet.locked) close() }} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(84vw,300px)] desk:w-[340px] bg-bg-el rounded-2xl p-5 shadow-[0_20px_60px_-12px_rgba(0,0,0,.5)] animate-[pop_.28s_var(--ease)]">
          {sheet.render(close)}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] touch-none overscroll-none" onClick={() => { if (!sheet.locked) close() }} />
      <div ref={ref} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        className="sheet absolute inset-x-0 bottom-0 bg-bg-el rounded-t-[22px] px-[18px] pt-2 pb-[calc(20px+env(safe-area-inset-bottom,0px))] max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y will-change-transform animate-[sheetup_.34s_var(--ease)] desk:left-1/2 desk:right-auto desk:-ml-[320px] desk:w-[640px]">
        <div className="w-9 h-[5px] rounded-full bg-label-4 mx-auto mt-1.5 mb-3.5" />
        {sheet.render(close)}
      </div>
    </div>
  )
}

export default function Modals() {
  const sheets = useUI(s => s.sheets)

  // lock the page behind any open sheet (iOS-safe)
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      window.scrollTo(0, y)
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="fixed inset-0 z-[100]">
      {sheets.map(s => <Sheet key={s.id} sheet={s} />)}
    </div>
  )
}

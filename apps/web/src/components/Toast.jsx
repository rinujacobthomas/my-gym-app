import { useUI } from '../store/useUI.js'
export default function Toast() {
  const msg = useUI(s => s.toastMsg)
  return (
    <div id="toast"
      className={'fixed left-1/2 z-[200] -translate-x-1/2 rounded-full px-5 py-[11px] text-[15px] font-medium text-center max-w-[88vw] ' +
        'bottom-[calc(96px+env(safe-area-inset-bottom,0px))] bg-[color-mix(in_srgb,var(--surface-2)_88%,transparent)] backdrop-blur-[20px] backdrop-saturate-180 ' +
        'shadow-[0_10px_30px_-6px_rgba(0,0,0,.5)] pointer-events-none transition-[opacity,transform] duration-200 ease-[var(--ease)] ' +
        (msg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[6px]')}>
      {msg}
    </div>
  )
}

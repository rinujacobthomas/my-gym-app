import { useState } from 'react'
import { imgSrc, gifSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Big autoplaying animation; tap toggles to the still frame. `compact` shrinks it (superset cards).
// Custom exercises have no media — the animation stays blank by design (issue #11).
// `minimizable` (workout view) adds a persistent minimize/expand control so the animation stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12).
export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  if (!ex.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }
  const h = mini ? 'h-[84px]' : compact ? 'h-[120px]' : 'h-[320px] desk:h-[420px]'
  return (
    <div id={id} onClick={() => setPlaying(p => !p)}
      className={'relative rounded-2xl overflow-hidden bg-white mb-3 ' + h}>
      <img decoding="async" src={playing ? gifSrc(ex) : imgSrc(ex)} alt={ex.n} className="w-full h-full object-contain block" />
      {minimizable && (
        <button className="absolute bottom-[9px] left-[9px] inline-flex items-center gap-1 bg-black/45 text-white rounded-full px-[11px] py-[5px] text-[12px] font-medium backdrop-blur-[12px]" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} className="text-[13px]" />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && (
        <span className="absolute bottom-[9px] right-[9px] inline-flex items-center gap-1 bg-black/45 text-white rounded-full px-[11px] py-[5px] text-[12px] font-medium backdrop-blur-[12px]">
          <Icon name={playing ? 'pause' : 'play'} className="text-[13px]" />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  if (!ex.img) return <div className="w-[50px] h-[50px] rounded-[9px] object-cover bg-white shrink-0 flex items-center justify-center text-[21px] bg-surface-2! text-label-2"><Icon name="dumbbell" /></div>
  return <img className="w-[50px] h-[50px] rounded-[9px] object-cover bg-white shrink-0" loading="lazy" decoding="async" src={imgSrc(ex)} alt="" />
}

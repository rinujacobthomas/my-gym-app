import { useEffect, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME, levelsOf } from '@og/core'
import { t } from '@og/core'

// Front and back views of a body, each muscle shaded by how hard it was worked.
//
// The five shade steps are the same accent ramp the activity heatmap uses, so
// "more accent = more training" means one thing everywhere in the app rather than two.
//
// The geometry is ~90 KB and only some screens show a map, so it is fetched on first
// render instead of riding along in the main bundle. Until it lands the component
// renders nothing but keeps its height, so nothing below it jumps on arrival.

let CACHE = null                                  // shared across every mounted map
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('@og/core').then(m => (CACHE = m.default))
    PENDING.then(p => { if (alive) setPaths(p) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return paths
}

// Muscle shading, derived from the text colour so contrast holds in both themes.
const SIL = 'fill-[var(--bm-sil)]'
const MUSCLE_FILL = [
  'fill-[var(--bm-base)]',
  'fill-[var(--bm-1)]',
  'fill-[var(--bm-2)]',
  'fill-[var(--bm-3)]',
  'fill-[var(--acc)]',
]

function View({ view, levels, onMuscle, selected }) {
  return (
    <svg className="flex-1 min-w-0 h-auto max-h-[min(46vh,340px)] [&>path]:[stroke:var(--surface)] [&>path]:[stroke-width:2.5] [&>path]:[stroke-linejoin:round]" viewBox={view.vb} role="img">
      {INERT.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className={SIL} d={d} />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) =>
        <path
          key={slug + i}
          className={MUSCLE_FILL[levels[slug] || 0] +
            ' transition-[fill] duration-200 ease-[var(--ease)]' +
            (onMuscle ? ' cursor-pointer' : '') +
            (selected === slug ? ' [stroke:var(--label)]! [stroke-width:7]!' : '')}
          d={d}
          onClick={onMuscle ? () => onMuscle(slug) : undefined}
        >
          <title>{t(MUSCLE_NAME[slug])}</title>
        </path>))}
    </svg>
  )
}

/**
 * <BodyMap load={{ chest: 12, … }} body="male" />
 * `load` is effective sets per muscle (see lib/muscles.js); shading is relative to
 * the hardest-worked muscle in that same load, so it always reads as a balance.
 */
export default function BodyMap({ load = {}, body = 'male', onMuscle, selected, className = '' }) {
  const paths = useBodyPaths()
  const levels = levelsOf(load)
  const g = paths && (paths[body] || paths.male)
  return (
    <div className={'flex gap-1.5 justify-center items-start ' + className}>
      {g ? <>
        <View view={g.front} levels={levels} onMuscle={onMuscle} selected={selected} />
        <View view={g.back} levels={levels} onMuscle={onMuscle} selected={selected} />
      </> : <div className="h-[200px] w-full" aria-hidden="true" />}
    </div>
  )
}

export function BodyMapLegend() {
  return <div className="flex items-center gap-1 justify-end mt-[9px] text-[11px] text-label-3">
    {t('Less')} <div className="w-[10px] h-[10px] rounded-[3px] shrink-0 bg-surface-2" />
    <div className="w-[10px] h-[10px] rounded-[3px] shrink-0 bg-[color-mix(in_srgb,var(--acc)_30%,var(--surface-2))]" />
    <div className="w-[10px] h-[10px] rounded-[3px] shrink-0 bg-[color-mix(in_srgb,var(--acc)_55%,var(--surface-2))]" />
    <div className="w-[10px] h-[10px] rounded-[3px] shrink-0 bg-[color-mix(in_srgb,var(--acc)_78%,var(--surface-2))]" />
    <div className="w-[10px] h-[10px] rounded-[3px] shrink-0 bg-acc" /> {t('More')}
  </div>
}

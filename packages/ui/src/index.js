// @og/ui — the openGym design system: controls, icons and chart primitives.
// Source-distributed inside the monorepo (apps transpile it through their own Vite pipeline).

import Icon from './Icon.jsx'

export { default as Icon, ICON_NAMES } from './Icon.jsx'
export * from './ui.jsx'
export { default as LineChart } from './LineChart.jsx'
export * from './LineChart.jsx'
export { default as Heatmap } from './Heatmap.jsx'
export * from './Heatmap.jsx'
export { default as BodyMap } from './BodyMap.jsx'
export * from './BodyMap.jsx'

// Convenience: the icon set is THE default export (apps mostly `import Icon from ...`).
export default Icon

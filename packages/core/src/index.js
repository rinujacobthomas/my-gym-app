// @og/core — pure training logic shared by every openGym app.
// No React, no DOM, no bundler-specific APIs. Translation is injected (see ./i18n.js).

export { setTranslator, setDateLocaleFn, dateLocale, t } from './i18n.js'
export * from './format.js'
export * from './exercises.js'
export * from './history.js'
export * from './onerm.js'
export * from './progression.js'
export * from './effort.js'
export * from './muscles.js'
export * from './body-paths.js'
export * from './starter.js'

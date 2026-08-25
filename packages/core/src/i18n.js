// Translation registry for @og/core.
//
// The core packages must stay UI-framework- and bundler-independent, so they cannot own
// the lazy-loading locale machinery (that lives in each app — see apps/web/src/lib/i18n.js,
// which uses Vite's import.meta.glob). Instead the app pushes a translate function + date
// locale in whenever its language changes, and every core module calls the same tiny t()
// it always did. Before registration everything falls back to English source strings.

let translate = s => s
let localeFn = () => 'en-GB'

export function setTranslator(fn) { translate = typeof fn === 'function' ? fn : s => s }
export function setDateLocaleFn(fn) { localeFn = typeof fn === 'function' ? fn : () => 'en-GB' }

export const dateLocale = () => localeFn()

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = translate(s) || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

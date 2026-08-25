import { Component } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

/**
 * Last line of defence: one bad render used to blank the whole app, with no way back —
 * a workout referencing an exercise the build doesn't know would white-screen and, since
 * the running workout is persisted, do it again on every reload.
 *
 * Sits inside #app so the tab bar stays usable; the shell keys this subtree on the route,
 * so switching tabs re-mounts it and clears the error by itself.
 */
export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('openGym render error:', err) }

  render() {
    if (!this.state.failed) return this.props.children
    const active = useStore.getState().S.active
    return (
      <div className="max-w-[640px] mx-auto">
        <div className="text-center text-label-2 px-5 py-[44px] text-[15px] leading-[1.45] mt-[18vh]">
          <div className="text-[34px] text-label-2 mb-3 flex justify-center"><Icon name="info" /></div>
          <div className="font-semibold mb-1.5">{t('Something went wrong')}</div>
          {t('This screen could not be drawn. Your data is safe on this device.')}
        </div>
        <Button variant="primary" icon="reset" onClick={() => location.reload()}>{t('Reload openGym')}</Button>
        {active && <>
          <div className="h-2" />
          <Button variant="danger" icon="trash" onClick={() => {
            useStore.getState().update(s => { s.active = null })
            location.reload()
          }}>{t('Discard the running workout')}</Button>
        </>}
      </div>
    )
  }
}

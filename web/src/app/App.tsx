import { ArcsView } from '@/components/ArcsView'
import { ArcScheduler } from '@/components/ArcScheduler'
import { NymsView } from '@/components/NymsView'
import { OpenRouterAuthControls, OpenRouterStatusBanner } from '@/components/OpenRouterAuthControls'
import { OpenRouterAuthManager } from '@/components/OpenRouterAuthManager'
import { SettingsModal } from '@/components/SettingsModal'
import { useAppStore } from '@/stores/app-store'
import type { AppView } from '@/types'

import styles from './App.module.css'

const APP_VIEWS: Array<{ id: AppView; label: string }> = [
  { id: 'arcs', label: 'Arcs' },
  { id: 'nyms', label: 'Nyms' },
]

function App() {
  const { activeView, isSettingsOpen } = useAppStore((state) => state.ui)
  const { setActiveView, openSettings, closeSettings } = useAppStore((state) => state.actions)

  const renderContent = () => {
    switch (activeView) {
      case 'nyms':
        return <NymsView />
      case 'arcs':
      default:
        return <ArcsView />
    }
  }

  return (
    <div className={styles.app}>
      <ArcScheduler />
      <OpenRouterAuthManager />
      <header className={styles.header}>
        <h1 className={styles.brand}>Symposium</h1>
        <nav className={styles.nav} aria-label="Primary">
          {APP_VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={[
                styles.navButton,
                view.id === activeView ? styles.navButtonActive : undefined,
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>
        <div className={styles.spacer} aria-hidden="true" />
        <div className={styles.controls}>
          <OpenRouterAuthControls />
          <button type="button" className={styles.settingsButton} onClick={openSettings}>
            <span aria-hidden="true">⚙</span>
            <span className={styles.visuallyHidden}>Settings</span>
          </button>
        </div>
      </header>
      <OpenRouterStatusBanner />
      <main className={styles.main}>
        <div className={styles.content}>{renderContent()}</div>
      </main>
      {isSettingsOpen ? <SettingsModal onClose={closeSettings} /> : null}
    </div>
  )
}

export default App

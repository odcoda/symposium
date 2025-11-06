import { ConversationsView } from '@/features/conversations/components/ConversationsView'
import { ConversationScheduler } from '@/features/conversations/components/ConversationScheduler'
import { PersonalitiesView } from '@/features/personalities/components/PersonalitiesView'
import {
  OpenRouterAuthControls,
  OpenRouterStatusBanner,
} from '@/features/openrouter/components/OpenRouterAuthControls'
import { OpenRouterAuthManager } from '@/features/openrouter/components/OpenRouterAuthManager'
import { SettingsModal } from '@/features/settings/components/SettingsModal'
import { useAppStore } from '@/stores/app-store'
import type { AppView } from '@/types'

import styles from './App.module.css'

const APP_VIEWS: Array<{ id: AppView; label: string }> = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'personalities', label: 'Personalities' },
]

function App() {
  const { activeView, isSettingsOpen } = useAppStore((state) => state.ui)
  const { setActiveView, openSettings, closeSettings } = useAppStore((state) => state.actions)

  const renderContent = () => {
    switch (activeView) {
      case 'personalities':
        return <PersonalitiesView />
      case 'conversations':
      default:
        return <ConversationsView />
    }
  }

  return (
    <div className={styles.app}>
      <ConversationScheduler />
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
            Settings
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

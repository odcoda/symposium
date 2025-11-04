import type { FormEvent } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { SchedulerSettings } from '@/types'

import styles from './SettingsModal.module.css'

type SettingsModalProps = {
  onClose: () => void
}

const clampNumber = (value: number, { min, max }: { min: number; max: number }) =>
  Math.min(Math.max(value, min), max)

const pacingLabels: Record<SchedulerSettings['responsePacing'], string> = {
  relaxed: 'Relaxed',
  steady: 'Steady',
  quick: 'Quick',
}

export const SettingsModal = ({ onClose }: SettingsModalProps) => {
  const settings = useAppStore((state) => state.scheduler.settings)
  const { updateSchedulerSettings } = useAppStore((state) => state.actions)

  const updateField = <K extends keyof SchedulerSettings>(field: K, value: SchedulerSettings[K]) => {
    updateSchedulerSettings({ [field]: value })
  }

  const handleBackdropClick = () => {
    onClose()
  }

  const handleModalClick = (event: FormEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={handleBackdropClick}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        onClick={handleModalClick}
      >
        <header className={styles.modalHeader}>
          <h2 id="settings-modal-title" className={styles.modalTitle}>
            Conversation settings
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.section}>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="max-concurrent">
              Concurrent responses
            </label>
            <input
              id="max-concurrent"
              className={styles.numberInput}
              type="number"
              min={1}
              max={5}
              step={1}
              value={settings.maxConcurrent}
              onChange={(event) =>
                updateField(
                  'maxConcurrent',
                  clampNumber(Number.parseInt(event.target.value, 10) || 1, { min: 1, max: 5 }),
                )
              }
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="response-delay">
              Delay between responses (ms)
            </label>
            <input
              id="response-delay"
              className={styles.numberInput}
              type="number"
              min={0}
              max={10000}
              step={100}
              value={settings.responseDelayMs}
              onChange={(event) =>
                updateField(
                  'responseDelayMs',
                  clampNumber(Number.parseInt(event.target.value, 10) || 0, {
                    min: 0,
                    max: 10000,
                  }),
                )
              }
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="response-pacing">
              Response pacing
            </label>
            <select
              id="response-pacing"
              className={styles.selectInput}
              value={settings.responsePacing}
              onChange={(event) =>
                updateField('responsePacing', event.target.value as SchedulerSettings['responsePacing'])
              }
            >
              {Object.entries(pacingLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.checkboxRow}>
            <span className={styles.fieldLabel}>Auto-start chat on new conversation</span>
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(event) => updateField('autoStart', event.target.checked)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

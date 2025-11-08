import type { ChangeEvent } from 'react'

import { useMemo } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { Nym } from '@/types'

import styles from './NymsView.module.css'

const MODEL_OPTIONS = [
  'openrouter/auto',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash',
  'openai/gpt-4.1-mini',
]

const formatPercent = (value: number, max = 1) => `${Math.round((value / max) * 100)}%`

const NymCard = ({ nym }: { nym: Nym }) => {
  const { updateNym, deleteNym } = useAppStore((state) => state.actions)

  const updateField = <K extends keyof Nym>(field: K, value: Nym[K]) => {
    updateNym(nym.id, { [field]: value })
  }

  const handleSliderChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: 'temperature' | 'eagerness',
  ) => {
    const numericValue = Number.parseFloat(event.target.value)
    if (Number.isNaN(numericValue)) {
      return
    }
    updateField(field, numericValue as Nym[typeof field])
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{nym.name}</h3>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => deleteNym(nym.id)}
        >
          Remove
        </button>
      </header>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`name-${nym.id}`}>
          Display name
        </label>
        <input
          id={`name-${nym.id}`}
          className={styles.textInput}
          value={nym.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="Nym display name"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`model-${nym.id}`}>
          Model
        </label>
        <select
          id={`model-${nym.id}`}
          className={styles.selectInput}
          value={nym.model}
          onChange={(event) => updateField('model', event.target.value)}
        >
          {MODEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`prompt-${nym.id}`}>
          System prompt
        </label>
        <textarea
          id={`prompt-${nym.id}`}
          className={styles.textArea}
          value={nym.prompt}
          onChange={(event) => updateField('prompt', event.target.value)}
          placeholder="Describe tone, responsibilities, and collaboration style"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`temperature-${nym.id}`}>
          Creativity {formatPercent(nym.temperature, 2)}
        </label>
        <input
          id={`temperature-${nym.id}`}
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={nym.temperature}
          onChange={(event) => handleSliderChange(event, 'temperature')}
          className={styles.rangeInput}
        />
        <div className={styles.sliderMeta}>
          <span>Focused</span>
          <span>Imaginative</span>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`eagerness-${nym.id}`}>
          Participation {formatPercent(nym.eagerness)}
        </label>
        <input
          id={`eagerness-${nym.id}`}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={nym.eagerness}
          onChange={(event) => handleSliderChange(event, 'eagerness')}
          className={styles.rangeInput}
        />
        <div className={styles.sliderMeta}>
          <span>Reserved</span>
          <span>Proactive</span>
        </div>
      </div>
    </article>
  )
}

export const NymsView = () => {
  const nymsById = useAppStore((state) => state.nyms)
  const { createNym } = useAppStore((state) => state.actions)

  const nyms = useMemo(() => Object.values(nymsById), [nymsById])

  const handleAddNym = () => {
    createNym({
      name: `Nym ${nyms.length + 1}`,
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>Nyms</h2>
        <button type="button" className={styles.addButton} onClick={handleAddNym}>
          Add nym
        </button>
      </header>
      <div className={styles.grid}>
        {nyms.map((nym) => (
          <NymCard key={nym.id} nym={nym} />
        ))}
      </div>
    </div>
  )
}

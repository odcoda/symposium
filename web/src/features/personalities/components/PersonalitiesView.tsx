import type { ChangeEvent } from 'react'

import { useMemo } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { Personality } from '@/types'

import styles from './PersonalitiesView.module.css'

const MODEL_OPTIONS = [
  'openrouter/auto',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash',
  'openai/gpt-4.1-mini',
]

const formatPercent = (value: number, max = 1) => `${Math.round((value / max) * 100)}%`

const PersonalityCard = ({ personality }: { personality: Personality }) => {
  const { updatePersonality, deletePersonality } = useAppStore((state) => state.actions)

  const updateField = <K extends keyof Personality>(field: K, value: Personality[K]) => {
    updatePersonality(personality.id, { [field]: value })
  }

  const handleSliderChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: 'temperature' | 'eagerness',
  ) => {
    const numericValue = Number.parseFloat(event.target.value)
    if (Number.isNaN(numericValue)) {
      return
    }
    updateField(field, numericValue as Personality[typeof field])
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{personality.name}</h3>
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => deletePersonality(personality.id)}
        >
          Remove
        </button>
      </header>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`name-${personality.id}`}>
          Display name
        </label>
        <input
          id={`name-${personality.id}`}
          className={styles.textInput}
          value={personality.name}
          onChange={(event) => updateField('name', event.target.value)}
          placeholder="Conversational partner name"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`model-${personality.id}`}>
          Model
        </label>
        <select
          id={`model-${personality.id}`}
          className={styles.selectInput}
          value={personality.model}
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
        <label className={styles.fieldLabel} htmlFor={`prompt-${personality.id}`}>
          System prompt
        </label>
        <textarea
          id={`prompt-${personality.id}`}
          className={styles.textArea}
          value={personality.prompt}
          onChange={(event) => updateField('prompt', event.target.value)}
          placeholder="Describe tone, responsibilities, and collaboration style"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`temperature-${personality.id}`}>
          Creativity {formatPercent(personality.temperature, 2)}
        </label>
        <input
          id={`temperature-${personality.id}`}
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={personality.temperature}
          onChange={(event) => handleSliderChange(event, 'temperature')}
          className={styles.rangeInput}
        />
        <div className={styles.sliderMeta}>
          <span>Focused</span>
          <span>Imaginative</span>
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor={`eagerness-${personality.id}`}>
          Participation {formatPercent(personality.eagerness)}
        </label>
        <input
          id={`eagerness-${personality.id}`}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={personality.eagerness}
          onChange={(event) => handleSliderChange(event, 'eagerness')}
          className={styles.rangeInput}
        />
        <div className={styles.sliderMeta}>
          <span>Reserved</span>
          <span>Proactive</span>
        </div>
      </div>

      <div className={styles.toggleRow}>
        <span className={styles.fieldLabel}>Allow automatic replies</span>
        <input
          type="checkbox"
          checked={personality.autoRespond}
          onChange={(event) => updateField('autoRespond', event.target.checked)}
        />
      </div>
    </article>
  )
}

export const PersonalitiesView = () => {
  const personalitiesById = useAppStore((state) => state.personalities)
  const { createPersonality } = useAppStore((state) => state.actions)

  const personalities = useMemo(() => Object.values(personalitiesById), [personalitiesById])

  const handleAddPersonality = () => {
    createPersonality({
      name: `Personality ${personalities.length + 1}`,
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>Personalities</h2>
        <button type="button" className={styles.addButton} onClick={handleAddPersonality}>
          Add personality
        </button>
      </header>
      <div className={styles.grid}>
        {personalities.map((personality) => (
          <PersonalityCard key={personality.id} personality={personality} />
        ))}
      </div>
    </div>
  )
}

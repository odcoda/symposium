import type { ChangeEvent } from 'react'

import { useEffect, useMemo, useState } from 'react'

import { useAppStore } from '@/stores/app-store'
import type { Nym, PreNym } from '@/types'
import { useOpenRouterClient } from '@/hooks/useOpenRouterClient'
import { getOpenRouterModelIds } from '@/lib/openrouter/models'

import styles from './NymsView.module.css'

const classNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ')

const MODEL_OPTIONS = [
  'openrouter/auto',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash',
  'openai/gpt-4.1-mini',
  // add some free options
  // TODO change this to a typeahead with drop down
  // TODO query openrouter to check metadata
  "x-ai/grok-4.1-fast",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
  "qwen/qwen3-coder:free",
  "moonshotai/kimi-k2:free",
]

const COLOR_OPTIONS = [
  '#6366f1',
  '#ec4899',
  '#f97316',
  '#14b8a6',
  '#0ea5e9',
  '#a855f7',
]

const DEFAULT_NYM_SETTINGS: Omit<PreNym, 'name' | 'color'> = {
  model: MODEL_OPTIONS[0],
  description: '',
  prompt: '',
  temperature: 0.6,
  eagerness: 0.5,
  politenessPenalty: 0.2,
  politenessHalfLife: 4,
  mentionBoost: 1,
  autoRespond: true,
}

const pickColor = (index: number) => COLOR_OPTIONS[index % COLOR_OPTIONS.length]

const NymCard = ({ nym }: { nym: Nym }) => {
  const { updateNym, deleteNym } = useAppStore((state) => state.actions)
  const client = useOpenRouterClient()
  const [validationStatus, setValidationStatus] = useState<'idle' | 'pending' | 'valid' | 'invalid' | 'error'>(
    'idle',
  )
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

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

  useEffect(() => {
    setValidationStatus('idle')
    setValidationMessage(null)
  }, [nym.model])

  const handleModelValidate = async () => {
    const modelToValidate = nym.model.trim()

    if (!modelToValidate) {
      setValidationStatus('invalid')
      setValidationMessage('Enter a model id to validate.')
      return
    }

    if (!client) {
      setValidationStatus('error')
      setValidationMessage('Connect OpenRouter to validate models.')
      return
    }

    setValidationStatus('pending')
    setValidationMessage(null)

    try {
      const modelIds = await getOpenRouterModelIds(client)

      if (nym.model.trim() !== modelToValidate) {
        return
      }

      const isValid = modelIds.includes(modelToValidate)
      setValidationStatus(isValid ? 'valid' : 'invalid')
      setValidationMessage(
        isValid ? 'Model available on OpenRouter.' : 'Model not found in OpenRouter catalog.',
      )
    } catch (error) {
      if (nym.model.trim() !== modelToValidate) {
        return
      }

      setValidationStatus('error')
      setValidationMessage(error instanceof Error ? error.message : 'Unable to validate right now.')
    }
  }

  const modelInputClassName = classNames(
    styles.textInput,
    styles.modelInput,
    validationStatus === 'valid' && styles.modelInputValid,
    (validationStatus === 'invalid' || validationStatus === 'error') && styles.modelInputInvalid,
  )

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
        <div className={styles.modelInputRow}>
          <input
            id={`model-${nym.id}`}
            className={modelInputClassName}
            value={nym.model}
            onChange={(event) => updateField('model', event.target.value)}
            placeholder="Enter any OpenRouter model"
          />
          <button
            type="button"
            className={styles.modelCheckButton}
            onClick={handleModelValidate}
            disabled={validationStatus === 'pending'}
          >
            {validationStatus === 'pending' ? 'Checking…' : 'Check'}
          </button>
        </div>
        {validationMessage ? (
          <span
            className={classNames(
              styles.modelValidationMessage,
              validationStatus === 'valid'
                ? styles.modelValidationSuccess
                : styles.modelValidationError,
            )}
          >
            {validationMessage}
          </span>
        ) : null}
        <select
          id={`model-select-${nym.id}`}
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
          Temperature: {nym.temperature}
        </label>
        <input
          id={`temperature-${nym.id}`}
          type="range"
          min={0}
          max={2}
          step={0.01}
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
          Eagerness to participate: {nym.eagerness}
        </label>
        <input
          id={`eagerness-${nym.id}`}
          type="range"
          min={0}
          max={1}
          step={0.01}
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
    const nextIndex = nyms.length + 1

    createNym({
      ...DEFAULT_NYM_SETTINGS,
      name: `Nym ${nextIndex}`,
      color: pickColor(nextIndex - 1),
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

const STORAGE_KEY = 'symposium:feature-flags'

export type FeatureFlag = 'stubLLM'
export type FeatureFlags = Record<FeatureFlag, boolean>

const defaultFlags: FeatureFlags = {
  stubLLM: false,
}

const flags: FeatureFlags = { ...defaultFlags }
let initialized = false

const ensureInitialized = () => {
  if (initialized) {
    return
  }
  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<FeatureFlags>
        Object.assign(flags, parsed)
      }
    } catch (error) {
      console.warn('[symposium] Unable to load feature flags, falling back to defaults', error)
    }
  }
  initialized = true
}

const persistFlags = () => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
  } catch (error) {
    console.warn('[symposium] Unable to persist feature flags', error)
  }
}

export const getFeatureFlag = (flag: FeatureFlag): boolean => {
  ensureInitialized()
  return flags[flag]
}

export const setFeatureFlag = (flag: FeatureFlag, value: boolean): boolean => {
  ensureInitialized()
  flags[flag] = Boolean(value)
  persistFlags()
  console.info(`[symposium] ${flag} is now ${flags[flag] ? 'enabled' : 'disabled'}`)
  return flags[flag]
}

const exposeConsoleHelpers = () => {
  if (typeof window === 'undefined') {
    return
  }

  if (!window.symposiumFlags) {
    const flagContainer = {} as FeatureFlags
    ;(Object.keys(flags) as FeatureFlag[]).forEach((flag) => {
      Object.defineProperty(flagContainer, flag, {
        configurable: true,
        get: () => getFeatureFlag(flag),
        set: (value: boolean) => {
          setFeatureFlag(flag, Boolean(value))
        },
      })
    })
    window.symposiumFlags = flagContainer
  }
}

export const bootstrapFeatureFlags = () => {
  ensureInitialized()
  exposeConsoleHelpers()
}

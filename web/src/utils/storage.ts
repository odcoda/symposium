const isBrowser = typeof window !== 'undefined'

const noopStorage: Storage = {
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
}

export const resolveStorage = (): Storage => {
  if (isBrowser && window.localStorage) {
    return window.localStorage
  }

  return noopStorage
}

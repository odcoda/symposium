const hasCrypto = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'

export const createId = () => {
  if (hasCrypto) {
    return crypto.randomUUID()
  }

  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

import type { PkceSession } from '@/types'
import { resolveStorage } from '@/utils/storage'

const storage = resolveStorage()

const PKCE_STORAGE_KEY = 'openrouter:pkce'

export const savePkceSession = (session: PkceSession) => {
  try {
    storage.setItem(PKCE_STORAGE_KEY, JSON.stringify(session))
  } catch (error) {
    console.error('Failed to persist PKCE session', error)
  }
}

export const consumePkceSession = (expectedState: string) => {
  try {
    const raw = storage.getItem(PKCE_STORAGE_KEY)
    if (!raw) {
      return null
    }
    storage.removeItem(PKCE_STORAGE_KEY)

    const session = JSON.parse(raw) as PkceSession
    if (session.state !== expectedState) {
      console.warn('PKCE state mismatch')
      return null
    }

    return session
  } catch (error) {
    console.error('Failed to read PKCE session', error)
    return null
  }
}

export const clearPkceSession = () => {
  try {
    storage.removeItem(PKCE_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear PKCE session', error)
  }
}

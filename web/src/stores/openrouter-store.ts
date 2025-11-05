import { create } from 'zustand'
import { createJSONStorage, devtools, persist } from 'zustand/middleware'

import type { OpenRouterTokens } from '@/types'
import { resolveStorage } from '@/utils/storage'

const STORE_KEY = 'openrouter-auth'

export type OpenRouterAuthStatus = 'signed-out' | 'authorizing' | 'authorized' | 'error'

interface OpenRouterState {
  tokens: OpenRouterTokens | null
  status: OpenRouterAuthStatus
  lastError: string | null
  actions: {
    setTokens: (tokens: OpenRouterTokens) => void
    clearTokens: () => void
    setStatus: (status: OpenRouterAuthStatus) => void
    setError: (message: string) => void
  }
}

const storage = createJSONStorage<Pick<OpenRouterState, 'tokens' | 'status'>>(() => resolveStorage())

const initialStatus: OpenRouterState['status'] = 'signed-out'

export const useOpenRouterStore = create<OpenRouterState>()(
  devtools(
    persist(
      (set) => ({
        tokens: null,
        status: initialStatus,
        lastError: null,
        actions: {
          setTokens: (tokens) =>
            set(
              () => ({
                tokens,
                status: 'authorized',
                lastError: null,
              }),
              false,
              'openrouter/setTokens',
            ),
          clearTokens: () =>
            set(
              () => ({
                tokens: null,
                status: 'signed-out',
                lastError: null,
              }),
              false,
              'openrouter/clearTokens',
            ),
          setStatus: (status) =>
            set(
              () => ({
                status,
              }),
              false,
              'openrouter/setStatus',
            ),
          setError: (message) =>
            set(
              () => ({
                lastError: message,
                status: 'error',
              }),
              false,
              'openrouter/setError',
            ),
        },
      }),
      {
        name: STORE_KEY,
        storage,
        partialize: (state) => ({
          tokens: state.tokens,
          status: state.status,
        }),
      },
    ),
    {
      name: 'openrouter-store',
    },
  ),
)

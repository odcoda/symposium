import { useEffect, useMemo, useRef } from 'react'

import { createOpenRouterClient } from '@/lib/openrouter/client'
import type { OpenRouterClient } from '@/lib/openrouter/client'
import type { OpenRouterTokens } from '@/types'
import { useOpenRouterStore } from '@/stores/openrouter-store'

export const useOpenRouterClient = (): OpenRouterClient | null => {
  const tokens = useOpenRouterStore((state) => state.tokens)
  const clearTokens = useOpenRouterStore((state) => state.actions.clearTokens)

  const tokensRef = useRef<OpenRouterTokens | null>(tokens)

  useEffect(() => {
    tokensRef.current = tokens
  }, [tokens])

  return useMemo(() => {
    if (!tokens) {
      return null
    }

    return createOpenRouterClient({
      getTokens: () => tokensRef.current,
      // TODO: handle this better
      // this was causing tons of auto-sign-outs during debugging which was very annoying
      // onUnauthorized: () => {
      //   clearTokens()
      // },
    })
  }, [clearTokens, tokens])
}

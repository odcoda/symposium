import { useEffect, useRef } from 'react'

import { exchangeAuthorizationCode } from '@/lib/openrouter/auth'
import { useOpenRouterStore } from '@/stores/openrouter-store'

const AUTH_QUERY_KEYS = ['code', 'state', 'error', 'error_description'] as const

type AuthQueryKey = (typeof AUTH_QUERY_KEYS)[number]

const readQueryParams = () => {
  const params = new URLSearchParams(window.location.search)
  const result: Partial<Record<AuthQueryKey, string>> = {}
  AUTH_QUERY_KEYS.forEach((key) => {
    const value = params.get(key)
    if (value) {
      result[key] = value
    }
  })
  return { params, result }
}

const clearAuthQueryParams = (params: URLSearchParams) => {
  AUTH_QUERY_KEYS.forEach((key) => params.delete(key))
  const nextQuery = params.toString()
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
  window.history.replaceState(null, document.title, nextUrl)
}

export const OpenRouterAuthManager = () => {
  const { setTokens, clearTokens, setStatus, setError } = useOpenRouterStore((state) => state.actions)
  const status = useOpenRouterStore((state) => state.status)
  const tokens = useOpenRouterStore((state) => state.tokens)
  const lastHandledState = useRef<string | null>(null)

  useEffect(() => {
    if (status === 'authorizing' && !tokens) {
      const { result } = readQueryParams()
      if (!result.code || !result.state) {
        setStatus('signed-out')
      }
    }
  }, [status, tokens, setStatus])

  useEffect(() => {
    const { params, result } = readQueryParams()
    if (result.error) {
      setError(result.error_description ?? result.error)
      clearAuthQueryParams(params)
      return
    }

    if (!result.code || !result.state) {
      return
    }

    const code = result.code
    const state = result.state
    if (lastHandledState.current === state) {
      return
    }
    lastHandledState.current = state
    clearAuthQueryParams(params)

    const run = async () => {
      try {
        setStatus('authorizing')
        const tokens = await exchangeAuthorizationCode({
          code,
          state,
        })
        setTokens(tokens)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OpenRouter authorization failed'
        setError(message)
        clearTokens()
      }
    }

    run()
  }, [clearTokens, setError, setStatus, setTokens])

  return null
}

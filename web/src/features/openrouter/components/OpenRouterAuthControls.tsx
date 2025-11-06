import { useMemo } from 'react'

import { createAuthorizationUrl } from '@/lib/openrouter/auth'
import { hasOpenRouterConfig, openRouterEnv } from '@/lib/env'
import { useOpenRouterStore } from '@/stores/openrouter-store'

import styles from './OpenRouterAuthControls.module.css'

const STATUS_COLORS: Record<string, string> = {
  authorized: '#22c55e',
  authorizing: '#facc15',
  'signed-out': '#facc15',
  error: '#f87171',
}

type StatusClass = 'bannerSuccess' | 'bannerWarning' | 'bannerError'

const statusToBannerClass: Record<string, StatusClass> = {
  authorized: 'bannerSuccess',
  authorizing: 'bannerWarning',
  'signed-out': 'bannerWarning',
  error: 'bannerError',
}

const getStatusText = (status: string, appTitle: string | null) => {
  switch (status) {
    case 'authorized':
      return `Connected to OpenRouter${appTitle ? ` as ${appTitle}` : ''}`
    case 'authorizing':
      return 'Connecting to OpenRouter…'
    case 'error':
      return 'OpenRouter connection error'
    default:
      return 'Not connected to OpenRouter'
  }
}

export const OpenRouterAuthControls = () => {
  const { status, tokens, lastError } = useOpenRouterStore((state) => state)
  const { setStatus, setError, clearTokens } = useOpenRouterStore((state) => state.actions)

  const isAuthorized = status === 'authorized' && Boolean(tokens)
  const credentialsAvailable = hasOpenRouterConfig()

  const handleSignIn = async () => {
    if (!credentialsAvailable) {
      setError('Missing OpenRouter OAuth configuration')
      return
    }

    try {
      setStatus('authorizing')
      const { url } = await createAuthorizationUrl()
      window.location.href = url
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start OpenRouter sign-in'
      setError(message)
    }
  }

  const handleSignOut = () => {
    clearTokens()
    setStatus('signed-out')
  }

  const statusLabel = useMemo(() => getStatusText(status, openRouterEnv.appTitle), [status])
  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS['signed-out']

  return (
    <div className={styles.container}>
      <span className={styles.statusDot} style={{ background: statusColor }} />
      <span className={styles.statusLabel}>{statusLabel}</span>
      <button
        type="button"
        className={styles.button}
        onClick={isAuthorized ? handleSignOut : handleSignIn}
        disabled={status === 'authorizing'}
      >
        {isAuthorized ? 'Sign out' : 'Sign in'}
      </button>
      {status === 'error' && lastError ? <span className={styles.statusLabel}>{lastError}</span> : null}
    </div>
  )
}

export const OpenRouterStatusBanner = () => {
  const { status, lastError } = useOpenRouterStore((state) => state)
  const message = getStatusText(status, openRouterEnv.appTitle)
  const className = styles[statusToBannerClass[status] ?? 'bannerWarning']

  return (
    <div className={`${styles.banner} ${className}`}>
      <div className={styles.bannerContent}>
        <span>{message}</span>
        {status === 'error' && lastError ? <span>· {lastError}</span> : null}
      </div>
    </div>
  )
}

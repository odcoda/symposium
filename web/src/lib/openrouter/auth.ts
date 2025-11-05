import { openRouterEnv, hasOpenRouterCredentials } from '@/lib/env'
import type { OpenRouterTokenResponse, OpenRouterTokens } from '@/types'

import { generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'
import { consumePkceSession, savePkceSession } from './storage'

const AUTHORIZE_URL = 'https://openrouter.ai/oauth/authorize'
const TOKEN_URL = 'https://openrouter.ai/api/v1/oauth/token'

const ensureCredentials = () => {
  if (!hasOpenRouterCredentials()) {
    throw new Error('OpenRouter OAuth environment variables are not configured')
  }
}

const parseScopes = (input?: string) =>
  input
    ?.split(/\s+/u)
    .map((scope) => scope.trim())
    .filter(Boolean) ?? []

const mapTokenResponse = (response: OpenRouterTokenResponse): OpenRouterTokens => {
  const expiresInMs = response.expires_in * 1000
  const safetyBuffer = 60 * 1000
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    tokenType: response.token_type ?? 'Bearer',
    scopes: parseScopes(response.scope).length
      ? parseScopes(response.scope)
      : openRouterEnv.scopes,
    expiresAt: Date.now() + Math.max(expiresInMs - safetyBuffer, safetyBuffer),
  }
}

export const createAuthorizationUrl = async (options?: {
  scopes?: string[]
  state?: string
  prompt?: 'consent' | 'none'
}) => {
  ensureCredentials()
  const state = options?.state ?? generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  savePkceSession({
    state,
    codeVerifier,
    createdAt: Date.now(),
  })

  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', openRouterEnv.clientId!)
  url.searchParams.set('redirect_uri', openRouterEnv.redirectUri!)
  url.searchParams.set('scope', (options?.scopes ?? openRouterEnv.scopes).join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', options?.prompt ?? 'consent')

  return {
    url: url.toString(),
    state,
  }
}

export const exchangeAuthorizationCode = async (params: { code: string; state: string }) => {
  ensureCredentials()
  const session = consumePkceSession(params.state)
  if (!session) {
    throw new Error('PKCE session missing or state mismatch; restart sign-in')
  }

  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: openRouterEnv.redirectUri!,
    client_id: openRouterEnv.clientId!,
    code_verifier: session.codeVerifier,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: payload,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to exchange authorization code: ${errorText}`)
  }

  const json = (await response.json()) as OpenRouterTokenResponse
  return mapTokenResponse(json)
}

export const refreshAccessToken = async (refreshToken: string) => {
  ensureCredentials()
  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: openRouterEnv.clientId!,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: payload,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh access token: ${errorText}`)
  }

  const json = (await response.json()) as OpenRouterTokenResponse
  return mapTokenResponse(json)
}

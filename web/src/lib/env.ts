export interface OpenRouterEnvConfig {
  clientId: string | null
  redirectUri: string | null
  scopes: string[]
  appUrl: string | null
  appTitle: string | null
}

const DEFAULT_SCOPES = [
  'openid',
  'offline_access',
  'chat.completions:write',
]

const parseScopes = (value: string | undefined): string[] => {
  if (!value) {
    return DEFAULT_SCOPES
  }

  return value
    .split(/,|\s/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

export const openRouterEnv: OpenRouterEnvConfig = {
  clientId: import.meta.env.VITE_OPENROUTER_CLIENT_ID ?? null,
  redirectUri: import.meta.env.VITE_OPENROUTER_REDIRECT_URI ?? null,
  scopes: parseScopes(import.meta.env.VITE_OPENROUTER_SCOPES),
  appUrl: import.meta.env.VITE_OPENROUTER_APP_URL ?? null,
  appTitle: import.meta.env.VITE_OPENROUTER_APP_TITLE ?? null,
}

export const hasOpenRouterCredentials = () => Boolean(openRouterEnv.clientId && openRouterEnv.redirectUri)

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_CLIENT_ID?: string
  readonly VITE_OPENROUTER_REDIRECT_URI?: string
  readonly VITE_OPENROUTER_SCOPES?: string
  readonly VITE_OPENROUTER_APP_URL?: string
  readonly VITE_OPENROUTER_APP_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

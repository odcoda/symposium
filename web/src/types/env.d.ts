/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENROUTER_CLIENT_ID?: string
  readonly VITE_OPENROUTER_REDIRECT_URI?: string
  readonly VITE_OPENROUTER_SCOPES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

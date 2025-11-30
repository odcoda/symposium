import type { FeatureFlags } from '@/lib/devtools/feature-flags'

declare global {
  interface Window {
    symposiumFlags?: FeatureFlags
    __symposiumUseStubbedLLMs?: boolean
  }
}

export {}

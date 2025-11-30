import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from '@/app/App'
import { bootstrapFeatureFlags } from '@/lib/devtools/feature-flags'
import '@/styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

bootstrapFeatureFlags()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

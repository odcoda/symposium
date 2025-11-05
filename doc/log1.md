## 2025-11-04

###  MVP Client Setup

  - Bootstraped the React + TS Vite app with tooling: added lint/format/test/typecheck scripts, Prettier config, and Vitest
  harness wired for jsdom + Testing Library (web/package.json:6, web/prettier.config.js:1, web/vite.config.ts:1, web/src/test/
  setup.ts:1).
  - Established shared infrastructure: path aliases, env scaffolding, and storage helpers so OpenRouter credentials and local
  persistence flow consistently (web/tsconfig.app.json:7, web/.env.example:1, web/src/lib/env.ts:1, web/src/utils/storage.ts:1,
  web/src/utils/id.ts:1).
  - Built the centralized Zustand store with localStorage persistence, seeded defaults, and action surface for conversations,
  personalities, and scheduler queue management (web/src/stores/app-store.ts:1).
  - Assembled the initial UI shell with navigation, conversation timeline, personality editor cards, and settings modal mapped
  to store state (web/src/app/App.tsx:1, web/src/features/conversations/components/ConversationsView.tsx:1, web/src/features/
  personalities/components/PersonalitiesView.tsx:1, web/src/features/settings/components/SettingsModal.tsx:1).
  - Refreshed styling to a reusable dark/light variable palette and mobile-responsive layouts for the primary views (web/
  src/app/App.module.css:1, web/src/features/conversations/components/ConversationsView.module.css:1, web/src/features/
  personalities/components/PersonalitiesView.module.css:1, web/src/features/settings/components/SettingsModal.module.css:1,
  web/src/styles/global.css:1).

  Tests: npm run lint; npm run typecheck; npm run test (passes with --passWithNoTests).

  Risk: current toolchain (Vite/Vitest/jsdom) emits engine warnings on Node 18.17—upgrade to Node ≥20 when possible to stay
  within supported ranges.

  Next steps: 1) Wire a chat composer plus request scheduler loop to feed the store queue. 2) Implement the OpenRouter OAuth
  PKCE handshake and stub streaming API calls. 3) Add persistence niceties (debounced autosave, migrations, onboarding) before
  broader feature work.

### Node Upgrade

  - Installed Node v22.21.1 via nvm, set it as the default (nvm alias default v22.21.1), and activated it for this repo so
  future shells pick it up automatically.
  - Recreated web/node_modules and regenerated web/package-lock.json under the new runtime, eliminating the earlier engine
  warnings.
  - Verified the toolchain with npm run lint, npm run typecheck, and npm run test (passes with --passWithNoTests).

  Next steps: 1) Open a new shell and confirm node --version shows 22.x (nvm should handle this). 2) From web, run npm run dev
  to launch the Vite dev server under the upgraded environment.

### Dev Workflow Fixes

Preview server was rebuilt (npm run build) and relaunched on 127.0.0.1:4173, which resolved the 404. Captured a baseline
  UI snapshot via Playwright (scripts/capture-preview.mjs), saved at web/artifacts/preview.png—you can view it locally or
  regenerate any time. If the preview server stops responding again, re-run npm run build followed by npm run preview -- --host
  127.0.0.1 --port 4173. Next steps: use this capture workflow while implementing chat composer/LLM plumbing so we can visually
  verify updates quickly.

npm run preview serves the contents of dist/. When we first tried, no production build existed yet (or it was stale), so
  Vite responded with 404 Not Found for /. After running npm run build, dist/index.html and the bundled assets were generated.
  Restarting the preview server then loaded those files—hence the HTTP 200 and working UI. The Playwright script just hit the
  now‑valid http://127.0.0.1:4173/ and saved a screenshot. So the fix was simply to build before previewing.

### Dev Workflow

Here’s a developer-friendly loop using the tooling we set up:

  1. Start Dev Server for Live Editing

  - From web/, run npm run dev.
  - Vite serves on 5173 by default with HMR, so your browser reflects code changes instantly.

  2. Run Quality Gates Often

  - npm run lint to catch style/logic issues.
  - npm run typecheck for static typing.
  - npm run test (currently passes with --passWithNoTests; add tests as you build features).

  To keep feedback fast, script them together (npm run lint && npm run typecheck && npm run test), or use your editor’s task
  runner.

  3. Generate a Production Preview

  - When you want to sanity-check the production bundle, build first: npm run build.
  - Then serve the build: npm run preview -- --host 127.0.0.1 --port 4173.
  - Visit http://127.0.0.1:4173/ in your browser.

  4. Capture Headless Screenshots

  - With the preview server running, grab a snapshot for reference:
    node scripts/capture-preview.mjs http://127.0.0.1:4173/ artifacts/some-name.png
  - Images land in web/artifacts/ and are handy for async reviews.

  5. Node Version Management

  - Before working, ensure you’re on Node 22: nvm use 22.
  - If you open a new shell, node --version should show v22.21.1.

  That’s it: dev server for iteration, lint/type/test for checks, build + preview + screenshot when you need to validate the
  production bundle. Add tests and Playwright scenarios as features grow, and we can expand the scripts accordingly.

### Composer

Added a real message composer to the Conversations workspace so the user can submit messages into the local store.

  - Introduced MessageComposer with send button, enter-to-send shortcut, character counter, and disabled state when empty (web/
  src/features/conversations/components/MessageComposer.tsx:1 and .module.css:1).
  - Embedded the composer beneath the message list, wrapped the body to allow scrolling + composer slots, and auto-
  scroll to the latest message via useEffect (web/src/features/conversations/components/ConversationsView.tsx:1,
  ConversationsView.module.css:1).
  - Updated layout spacing and ensured smooth scroll behavior with a sentinel div.
  - Refreshed tooling output: npm run lint, npm run typecheck, npm run test (pass), npm run build.
  - Captured a new preview screenshot with Playwright (web/artifacts/preview-composer.png) showing the composer in the UI.

  Next steps: 1) Wire composer actions into a scheduler/LLM request queue so messages can trigger responses. 2) Add basic tests
  around store mutations (appendMessage) and the composer behavior (component test with Testing Library).

### Personalities bug fix

Fixed the crash when switching to “Personalities.” The issue came from subscribing to Object.values(state.personalities)
  directly inside Zustand’s selector, which returns a new array on every render and triggered an infinite update loop. I now
  select the dictionary (state.personalities) and memoize the derived array with useMemo, so the selector stays referentially
  stable (web/src/features/personalities/components/PersonalitiesView.tsx:1). Lint/type/test all pass, npm run build succeeds,
  and artifacts/preview-personalities.png shows the view working. You can freely toggle between Conversations and Personalities
  without the app disappearing. Ready to proceed with the next feature whenever you are.

### Prototype composer

Composer messages now kick off automated follow-ups: after sending, each active, auto-responding personality is queued for a
  reply so the scheduler has concrete work items to process.

  - MessageComposer now grabs the current conversation and personalities from the store. When you submit a message it still
  appends the user message, but it also enqueues request entries—only for personalities that have autoRespond enabled (web/src/
  features/conversations/components/MessageComposer.tsx:1).
  - Lint/type/test/build all green. Captured an updated preview at web/artifacts/preview-queue.png (UI unchanged visually;
  queue runs on the data layer).

  Next steps: 1) Implement a scheduler effect that consumes scheduler.queue (respecting maxConcurrent/responseDelayMs) and
  marks in-flight vs. completed. 2) Stub an OpenRouter client to turn queued jobs into mocked responses until real streaming
  is ready.

### OpenRouter Client

  - Expanded environment config to capture optional attribution headers and documented new vars (web/src/lib/env.ts:1,
  web/.env.example:1, web/src/types/env.d.ts:1).
  - Added OpenRouter domain types plus PKCE utilities and storage helpers for managing authorization state (web/src/types/
  openrouter.ts:1, web/src/lib/openrouter/pkce.ts:1, web/src/lib/openrouter/storage.ts:1).
  - Implemented OAuth helpers to build authorization URLs, exchange codes, and refresh tokens, along with a typed fetch client
  for models and chat responses (web/src/lib/openrouter/auth.ts:1, web/src/lib/openrouter/client.ts:1).
  - Created a persisted Zustand store for tokens/status and a hook that exposes a ready-to-use OpenRouter client instance (web/
  src/stores/openrouter-store.ts:1, web/src/hooks/useOpenRouterClient.ts:1, web/src/types/index.ts:1).

  Tests: npm run lint; npm run typecheck; npm run test.

  Next steps: 1) Build UI flows that call createAuthorizationUrl and handle the redirect callback to populate the auth store.
  2) Integrate the useOpenRouterClient hook with the conversation scheduler to fetch model lists and issue chat completions
  (mock responses until scheduler is ready).


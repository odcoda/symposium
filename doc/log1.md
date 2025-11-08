## 2025-11-08
### OAuth debug
- When we first hit the auth callback, the URL bar looks like
http://localhost:5173/auth/callback?code=cbcbe7cb-3168-4140-b89d-77b4f7b5be96&state=cb0c7d43-bf7b-41b1-abf9-d0bb21373183
- Local storage shows
```
openrouter-auth
{
    "state": {
        "tokens": null,
        "status": "signed-out"
    },
    "version": 0
}

openrouter:pkce
{
    "state": "cb0c7d43-bf7b-41b1-abf9-d0bb21373183",
    "codeVerifier": "1LyGO6K9TFI8QA0oUHdi4R9T3nx3u7K75MUvIgAcQ5dHweRbOabLIbKkQRN84wpXWmyQMyp0UaWJJ-C57qnHVzzrQNU_I17OU6VAX12GJVAiPX2sFuHNPrf84_QDm1mg",
    "createdAt": 1762618286871
}
```

- we consume the session from openrouter:pkce and it gets cleared
- we send out a request to https://openrouter.ai/api/v1/auth/keys with the correct code and state
- BUT THEN
- we somehow end up back running the authentication again (wtf?)
- the session has been cleared

#### StrictMode remount

- StrictMode remount: createRoot(rootElement).render(<StrictMode><App /></StrictMode>) (web/src/main.tsx:13-16) means every
  component, including OpenRouterAuthManager, is mounted, unmounted, and remounted immediately in development. React runs each
  useEffect once, calls its cleanup, then reruns it to surface side effects.
  - Effect logic: The auth effect (web/src/features/openrouter/components/OpenRouterAuthManager.tsx:36-84) reads the query,
  defines run, sets status to authorizing, and awaits exchangeAuthorizationCode. StrictMode invokes the effect, and while the
  first run() is still sitting on await fetch(...), React executes the cleanup function (lines 81-83) to simulate an unmount,
  flipping cancelled = true. It then re-runs the effect immediately, so run() fires a second time with the same code/state
  because the first invocation hasn’t reached the finally block that scrubs the URL yet.
  - Result: You observe “as soon as we send out the request and await fetch(), our main event loop schedules another run()”
  because StrictMode deliberately replays the effect before the first async work settles. The duplicate call is not coming
  from your code, but from React’s double-effect behavior in StrictMode. Removing <StrictMode>, deferring setStatus/fetch until
  after you’ve cleared the query params, or guarding with a useRef (e.g., bail if already handling a code) will stop the second
  invocation.

 - StrictMode remount is what’s firing run() twice: createRoot(... <StrictMode> ...) (web/src/main.tsx:13-16) makes React
  invoke every useEffect twice in dev. Your auth effect (web/src/features/openrouter/components/OpenRouterAuthManager.tsx:36-
  84) reads code/state, kicks off run(), then React immediately executes the cleanup and re-runs the effect. Because the URL
  still contains code and state—you only strip them in the async finally—the second pass sees the same params and launches a
  second run(). Meanwhile the cleanup from the first pass sets cancelled = true, so when the first fetch completes it treats
  itself as cancelled and never calls setTokens.
  - Best fix: make the effect idempotent by clearing the auth params before any async work so only the first pass can see
  them. Capture result.code/state, immediately remove the keys from the URL, then run the exchange with those captured values.
  That way StrictMode’s second invocation has nothing to do and the first pass isn’t marked cancelled before it can finish.
  For example:

```
  useEffect(() => {
    const { params, result } = readQueryParams()
    if (!result.code || !result.state) return

    const clearAuthQuery = () => {
      AUTH_QUERY_KEYS.forEach((key) => params.delete(key))
      const next = params.toString()
      window.history.replaceState(null, document.title, next ? `${window.location.pathname}?${next}` :
  window.location.pathname)
    }

    clearAuthQuery() // remove code/state immediately

    let cancelled = false
    ;(async () => {
      try {
        setStatus('authorizing')
        const tokens = await exchangeAuthorizationCode({ code: result.code, state: result.state })
        if (!cancelled) setTokens(tokens)
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'OpenRouter authorization failed')
          clearTokens()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [clearTokens, setError, setStatus, setTokens])
  ```

  - This change keeps the nice “don’t update after unmount” guard, stops duplicate exchanges, and still ensures the URL is
  sanitized even if the browser refreshes mid-flow. If you want extra safety in production too, you can also gate on a useRef
  (e.g., processedRef.current === ${result.state}:${result.code}``) to prevent re-entry should a user manually reintroduce the
  query string.

- Added clearAuthQueryParams helper so the callback URL gets scrubbed immediately on error or success (web/src/features/
  openrouter/components/OpenRouterAuthManager.tsx:6-25,34-48).
  - Updated the auth effect to capture code/state, clear the query string before starting the async exchange, and reuse those
  captured values so StrictMode’s duplicate effect run can’t launch a second request or cancel the first (web/src/features/
  openrouter/components/OpenRouterAuthManager.tsx:50-92).

 - OpenRouterAuthManager now tracks the last processed OAuth state in a ref and clears the callback query params before
  launching the token exchange, so StrictMode’s duplicate effect run can’t re-trigger the flow (web/src/features/openrouter/
  components/OpenRouterAuthManager.tsx:1-67).
  - Removed the cancelled guard so a token returned by the first fetch is always persisted even if React simulates an
  unmount, preventing the “scrubbed code/state but no token saved” dead-end (web/src/features/openrouter/components/
  OpenRouterAuthManager.tsx:40-63).



### writing code by hand
- See doc/intro-for-python-devs.md

## 2025-11-07
### struggles
I failed to write some JS/TS by hand to fix the conversation backoff code. Work in progress.

## 2025-11-06

### Scheduler backoff algorithm
- Added scheduler utilities to track mention and politeness scores per personality and refresh them whenever messages are appended, enabling the backoff algorithm’s state updates. 

- Extended personality defaults, creation/deletion flows, and persisted scheduler data to include the algorithm’s parameters and maintain per-personality scheduler state. 

- Implemented softmax-based sampling in the conversation scheduler so queued requests are launched according to the new backoff weights and global temperature. 

- Refactored the scheduler to rely on new math helpers for computing logits, probabilities, and sampling when selecting queued requests.

- Exported the scheduler state update utilities so deterministic state transitions can be exercised in tests.

- Added a Vitest case that replays a canned message sequence and asserts the resulting logits and probabilities for easy inspection.

## 2025-11-05

### OAuth bug fixes
- fixed vibed (incorrect) URLs
- ran far enough that oauth response shows up with a key
- UI still doesn't look quite right (and I suspect the key did not make it into local storage)

### Security Review

  - src/lib/openrouter/storage.ts:17 now skips the PKCE state comparison whenever the callback omits state (if (expectedState
  && …)). That removes the CSRF safeguard PKCE relies on; an attacker that can trigger OAuth in the victim’s browser could
  bounce them back with their own authorization code and succeed because we still have a valid PKCE verifier stored. Treat
  missing state as an error (or fall back to a secondary verifier) instead of silently accepting it.
  - src/lib/env.ts:24 / src/lib/openrouter/auth.ts:24 allow running without a client id, flipping to the /auth shortcut.
  That’s fine, but you must still demand a returned state; if the hosted flow truly never sends one, wrap the callback in an
  additional origin check (e.g., hash the verifier into the redirect URL) before shipping.

  Manual Testing

  - In a fresh tab (logged out), run:

    const auth = await import('/src/lib/openrouter/auth.ts');
    const { url } = await auth.createAuthorizationUrl();
    window.location.href = url;
    This stores the PKCE verifier/state in localStorage['openrouter:pkce'] and redirects you to OpenRouter.
  - After consenting, OpenRouter sends you back to VITE_OPENROUTER_REDIRECT_URI. In the console on that page:

    const auth = await import('/src/lib/openrouter/auth.ts');
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state'); // should be non-null; if null, abort
    const tokens = await auth.exchangeAuthorizationCode({ code, state: state ?? '' });
    const { useOpenRouterStore } = await import('/src/stores/openrouter-store.ts');
    useOpenRouterStore.getState().actions.setTokens(tokens);
    Inspect useOpenRouterStore.getState().tokens to confirm they persisted.
  - To exercise the no-client-id branch, remove VITE_OPENROUTER_CLIENT_ID, reload, and repeat. Verify the callback still
  returns state; if it doesn’t, fix the guard before relying on this flow.

#### What is client_id?

client_id is the identifier OpenRouter assigns when you register an OAuth client. In the “pure” OAuth 2.0 PKCE flow the steps
  are:

  - You tell OpenRouter “I’m client abc123, redirect me to https://foo/callback, and here’s my PKCE challenge.”
  - After the user consents, OpenRouter sends the browser back to that redirect with code (and usually state).
  - You redeem the code, presenting the code_verifier plus your client_id.

  Because your codebase supports both registered and unregistered flows, createAuthorizationUrl branches:

  - With client_id (AUTHORIZE_URL): uses the full OAuth endpoints. You must have a registered client in OpenRouter’s dashboard
  (they’re rolling this out slowly; if you don’t see a form, you need to request access via support).
  - Without client_id (AUTH_URL): hits the hosted “sign in and bounce back” endpoint OpenRouter exposes for quick integrations.
  In that mode the server already knows which app is asking (because you configured the callback URL in their UI or they
  default to generic behavior), so you only pass callback_url; client_id isn’t required.

  The fallback exists so you can start testing even if you haven’t been issued a client id, but once OpenRouter gives you one
  you should use the full OAuth branch—PKCE + registered redirect URIs is the standard, auditable flow.

  Security-wise the two are equivalent provided you still verify state on the callback. Right now consumePkceSession skips that
  check when the provider omits state; restore the validation or add another signed token in the URL. Without it, a malicious
  tab could inject their own authorization code, even though PKCE still protects against code interception.

  If you want a client id today and don’t see a self-serve form, reach out to OpenRouter support—they’re issuing ids to select
  partners. Until then, the AUTH_URL branch will work for local testing, but keep the state guard in place so you’re ready when
  you switch to the full client flow.

#### PKCE at a Glance
  Proof Key for Code Exchange augments OAuth’s authorization-code flow so public clients (mobile apps, SPAs) can’t have their
  authorization code stolen and reused.

  1. Generate a secret locally. Before redirecting to the provider, the client creates a random code_verifier.
  2. Derive a public value. It hashes that verifier into a code_challenge and includes it, along with client ID, redirect URI,
  scopes, etc., when it sends the user to the provider.
  3. Provider keeps the challenge. The user signs in; the provider stores the code_challenge tied to the session and redirects
  back with a short-lived code and the state.
  4. Redeem with proof. The client exchanges the code for tokens by sending code_verifier. The provider re‑hashes it and checks
  it matches the stored challenge before issuing tokens.

  Why it’s secure: even if an attacker intercepts the redirect and grabs the code, they can’t redeem it without the verifier,
  which only the original client knows. The state parameter adds CSRF protection—if the value coming back isn’t the one you
  stored, you abort.

  It’s standard for SPA/mobile apps and considered safe when you enforce TLS, use unpredictable verifiers, and validate state
  and redirect_uri. The code in your repo does exactly that: generates a verifier/challenge (src/lib/openrouter/pkce.ts),
  stores the verifier keyed by state, and only issues tokens when the returning state matches. So yes, it’s the recommended way
  to secure OAuth for public clients.

#### Why is state important?
If an OAuth provider skips state on the redirect, you lose a key CSRF guard. PKCE stops someone from redeeming the
  authorization code without your code_verifier, but it doesn’t stop a malicious page or MITM from initiating their own auth
  request and bouncing the victim back to your redirect URI with that attacker-generated code. If your app blindly exchanges
  it, you’ll end up logged in as (or sending data to) the attacker’s account.

  So best practice is:

  - Always send a random state when you build the authorize URL.
  - Reject callbacks that don’t include the same state you stored.

  If OpenRouter truly omits state in their redirect, treat that as a security bug and contact them. Until it’s fixed, the only
  mitigation is to ensure your redirect handler decodes parameters from a location you trust (e.g., same-origin route) and
  never accepts codes triggered by untrusted contexts—but verifying state is the standard defense.

  Double-check, though: many docs show a simplified callback snippet that reads only code, yet the actual service still returns
  state when you supply one. The implementation in this repo already stores and validates state, so if you observe it missing
  in practice, it’s worth reporting upstream.

state blocks CSRF precisely because a MITM or malicious site can’t automatically get the exact value your app generated:

  1. When you send the user to the OAuth provider, you generate a high-entropy state, save it locally, and include it in the
  redirect URL.
  2. The attacker can start their own OAuth flow and bounce the user to your redirect, but their flow uses their state. You
  compare the returning state to the one you stored; it doesn’t match, so you reject the response.
  3. If the attacker doesn’t know your state (they shouldn’t; it never leaves your app except inside the initial redirect
  request over TLS), they can’t forge a valid callback.
  4. Even if they somehow intercepted your redirect request, they’d also see the code_verifier, so PKCE relies on TLS + state;
  but state still prevents same-origin CSRF (e.g., a malicious form POSTing to your callback URL with an attacker-issued code).

  So PKCE protects the code exchange, state protects the callback from being replayed or hijacked. Neither replaces the other;
  together they close the main OAuth-for-SPA holes. Without state, a malicious script could submit an auto-login request to
  your redirect URI with their own code (since they control the browser) and trick your app into linking the victim session to
  the attacker’s account. The state check stops that.


### OAuth button bug
Good catch—the button was disabled because the store stayed in the authorizing state after you hit “Sign in” but returned
  without an OAuth code/state in the URL (for example, canceling out of the OpenRouter page). That state keeps the button
  disabled and shows “Connecting to OpenRouter…”.

  I added a guard in OpenRouterAuthManager:14 that runs on mount: if the status is still authorizing, no tokens are stored, and
  there’s no code/state query present, it resets the status back to signed-out. Now the button re-enables so you can start the
  PKCE flow again. Lint passes (npm run lint). Try reloading the page—“Sign in” should be clickable again.

### OAuth changes
Updated the OAuth flow so you can use pure PKCE without embedding a client ID, matching the OpenRouter docs snippet.

  - Swapped PKCE helpers over to the exact Buffer.from(...).toString('base64url') approach and added the buffer polyfill so
  Vite can bundle it (web/src/lib/openrouter/pkce.ts:1, web/package.json:19).
  - Relaxed the auth config requirement: only VITE_OPENROUTER_REDIRECT_URI is needed now; client_id is optional.
  createAuthorizationUrl automatically chooses the /auth endpoint when no client ID is present and uses the new callback_url
  parameter (web/src/lib/openrouter/auth.ts:1, web/src/lib/env.ts:8).
  - Made PKCE storage tolerant of flows that don’t return a state param and adjusted the auth manager to exchange
  codes even when state is absent (web/src/lib/openrouter/storage.ts:1, web/src/features/openrouter/components/
  OpenRouterAuthManager.tsx:14).
  - UI controls now rely on the relaxed config check and surface errors if you try to sign in without a redirect configured
  (web/src/features/openrouter/components/OpenRouterAuthControls.tsx:4).

  With VITE_OPENROUTER_REDIRECT_URI set (and optional APP_URL/TITLE for attribution), the “Sign in” button launches the PKCE
  flow at https://openrouter.ai/auth?... and handles the callback without hard-coded credentials. Tests remain green (npm run
  lint, npm run typecheck, npm run test).

Restored the PKCE state requirement while keeping the client‑id optional flow.

  - exchangeAuthorizationCode once again insists on a state and consumePkceSession validates it, ensuring CSRF protection (web/
  src/lib/openrouter/auth.ts:43, web/src/lib/openrouter/storage.ts:15).
  - The auth manager now bails unless both code and state are present, forwarding both to the exchange call (web/src/features/
  openrouter/components/OpenRouterAuthManager.tsx:32).

  Lint/type/test all pass. The sign-in button still uses /auth?callback_url=... but now always includes a state query parameter
  that must round-trip, preventing unauthorized callbacks.

The “Unknown encoding: base64url” error comes from Buffer.toString('base64url'), which isn’t supported by the browser-
  friendly Buffer polyfill. I replaced it with a helper that converts to standard base64 and manually applies the URL-safe
  substitutions (web/src/lib/openrouter/pkce.ts:4). Now both the verifier and challenge use toBase64Url, so the sign-in flow
  can generate PKCE code challenges without errors. All scripts (npm run test) still pass; you should be able to click “Sign
  in” and reach OpenRouter’s OAuth page successfully.

### OAuth UI
OpenRouter auth is now wired into the UI so you can connect directly from the app.

  - Introduced PKCE callback handling via OpenRouterAuthManager, which detects code/state in the URL, exchanges them for
  tokens, and persists them in the auth store (web/src/features/openrouter/components/OpenRouterAuthManager.tsx:1).
  - Added top-right controls that reflect connection state and let you sign in/out. The button kicks off the
  OAuth flow when credentials are present; errors surface inline (web/src/features/openrouter/components/
  OpenRouterAuthControls.tsx:1, .module.css:1).
  - Display a status banner under the header so the user always knows whether OpenRouter is connected, authorizing, or errored.
  - Updated App layout to include the scheduler, auth manager, controls, and banner (web/src/app/App.tsx:1, App.module.css:1).
  - Rebuilt styles/tests; new screenshot at web/artifacts/preview-auth.png shows the banner + sign-in button.

  Tests: npm run lint; npm run typecheck; npm run test; npm run build.

  Next steps: 1) After you supply real OpenRouter OAuth credentials (.env), sign in via the new button to validate the flow. 2)
  Hook scheduler outputs to show live “X is replying…” indicators and streaming updates, using the auth tokens to hit the real
  API when ready.

### Streaming Plan

To stream each request without breaking the existing queue/scheduler design, treat streaming as part of startRequest:

  1. Keep enqueueing work through the queue

  - MessageComposer already calls queueRequest. Keep that pattern; it keeps producers decoupled from the scheduler and
  preserves concurrency limits.
  - When you enqueue, mark the user’s message as queued or pending (whatever status you like) so the UI shows something is
  about to happen.

  2. Let the scheduler own streaming

  - In startRequest, create an AbortController and kick off the OpenRouter call with stream: true.
  - Grab the reader (response.body?.getReader()), decode SSE chunks (exactly like the OpenRouter sample), and append content
  into a buffer.
  - After each chunk arrives, call updateMessage(messageId, { content: buffer }) so the UI gets live updates. The Message
  record stays the single place components read from.
  - When reader.read() returns done, flip the message to { status: 'complete' }, remove the queue item, and keep the final
  content in state.

  3. Keep concurrency under control

  - The existing activeRequests set plus maxConcurrent logic already limits the number of concurrent startRequest invocations.
  Because each call is async and you aren’t awaiting them in the loop, multiple streaming responses can flow simultaneously.
  - Users can send more messages while streams are active; each new message just queues another RequestQueueItem and the
  scheduler will grab it once a slot opens.

  4. Support cancellation & cleanup

  - Store the AbortController on a local map keyed by request.id if you want to cancel when the user deletes a message or hits
  “stop”.
  - In finally, whether success or error, make sure to reader.cancel() (if you obtained one),
  activeRequests.current.delete(request.id), and tidy any controller map entry.

  5. Fit this into your existing executor

  - Right now executeChatCompletion only does a full JSON request. You can either:
      - Replace it with a streaming implementation (set body.stream = true, parse the SSE stream, invoke onContentChunk on each
  chunk), returning the final message at the end; or
      - Add a new executeStreamingChatCompletion and call that from ConversationScheduler while leaving the existing function
  for non-streaming use.

  6. Handle errors

  - If any chunk parsing throws, call failRequest(request, error.message) so the message shows “LLM error: …” just like today.
  - Because you’re updating the message content incrementally, choose whether to leave the partial text or clear it on error;
  you can set content: previousContent + '\n\n(LLM error …)'.

  This approach keeps the queue as the handoff point, lets multiple streams run in parallel within the concurrency cap, and
  keeps UI components simple—they just read message records and render whatever content/status is there.

### type comments
- added some descriptions of the types
- clean up slightly more unused types

## 2025-11-04
### type fixes
- removed some duplicate fields (personality id and author id)
- removed some pinned memory stuff which was totally unused (no files yet)
- we should add docstrings, eventually

### Persist Merge Fix

  - Added a custom merge for the persisted store so hydration deep-merges scheduler.settings while retaining in-memory queue
  and inFlightIds, preventing state.scheduler.queue from being clobbered (src/stores/app-store.ts:545).
  - The same merge keeps ui.isSettingsOpen intact and only overrides activeView when it exists in storage.

  No automated tests run (logic-only change). Next step: clear any stale symposium-app-state entry in localStorage once so the
  new merge hydrates cleanly, then reload to confirm the queue now starts as [].

### Scheduler & OpenRouter Scaffolding

  - Added OpenRouter domain types, PKCE helpers, token persistence, and a reusable client/executor pair so the app can
  authorize and send chat completion requests (stubbed when no token) (web/src/types/openrouter.ts, web/src/lib/openrouter/
  {pkce,storage,auth,client,executor}.ts, web/src/stores/openrouter-store.ts, web/src/hooks/useOpenRouterClient.ts, env
  updates).
  - Implemented a store action to mark requests in flight, clearing them on completion (web/src/stores/app-store.ts:85).
  - Built ConversationScheduler—a headless component wired into App—that respects user settings, tracks concurrency,
  prepares prompts, and enqueues personality replies via the executor (web/src/features/conversations/components/
  ConversationScheduler.tsx, web/src/app/App.tsx:10). Stubbed responses allow local testing without OpenRouter credentials;
  failures bubble into message status.

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


### Personalities bug fix

Fixed the crash when switching to “Personalities.” The issue came from subscribing to Object.values(state.personalities)
  directly inside Zustand’s selector, which returns a new array on every render and triggered an infinite update loop. I now
  select the dictionary (state.personalities) and memoize the derived array with useMemo, so the selector stays referentially
  stable (web/src/features/personalities/components/PersonalitiesView.tsx:1). Lint/type/test all pass, npm run build succeeds,
  and artifacts/preview-personalities.png shows the view working. You can freely toggle between Conversations and Personalities
  without the app disappearing. Ready to proceed with the next feature whenever you are.


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


### Node Upgrade

  - Installed Node v22.21.1 via nvm, set it as the default (nvm alias default v22.21.1), and activated it for this repo so
  future shells pick it up automatically.
  - Recreated web/node_modules and regenerated web/package-lock.json under the new runtime, eliminating the earlier engine
  warnings.
  - Verified the toolchain with npm run lint, npm run typecheck, and npm run test (passes with --passWithNoTests).

  Next steps: 1) Open a new shell and confirm node --version shows 22.x (nvm should handle this). 2) From web, run npm run dev
  to launch the Vite dev server under the upgraded environment.


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


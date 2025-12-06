## 2025-12-06
### Manual testing
- paid models and messages work
- token and cost counting works (checked against openrouter)
- conversation rendering is really weird right now

### Some UI changes
  - Added inline rename + active-nym editors for the currently open arc, complete with pen-icon toggles, local draft state, store
  updates, and safeguards that collapse one editor when the other opens so the UI stays compact (src/components/ArcsView.tsx:216-
  541). Supporting styles cover the icon buttons, inline editor shell, chip list, and multi-select checkbox grid to keep the
  controls tidy (src/components/ArcsView.module.css:115-263).
  - When editing nyms, the preset model dropdown now goes blank whenever the model string doesn’t match a predefined option,
  making it obvious that a custom value is active while still allowing users to reselect a preset quickly (src/components/
  NymsView.tsx:53-200).


### Error bug fix
  - Scheduler now restores the user message to complete and clears its error details whenever a response placeholder exists,
  keeping the error banner on the assistant reply only (web/src/components/ArcScheduler.tsx:38-66).
  - startRequest tracks the responseMsgId outside the try/catch, so when a request fails after the queue entry disappears the
  catch block still knows which assistant message to annotate (web/src/components/ArcScheduler.tsx:83-219). This fixes the root
  cause where the fallback lookup returned null, forcing failRequest to mark the original user message as errored.

### Generation info (tokens and cost)
#### Async request
- Generation metadata is now fetched in the background after a completion finishes streaming. executeChatCompletion just
  returns the streamed response/content, and the new fetchGenerationWithRetry helper (web/src/lib/openrouter/executor.ts:21-
  193) retries the /generation call once after a 1 s pause before giving up, logging failures but not blocking the UI.
  - Direct responses trigger that helper asynchronously once the completion id is available; when the metadata finally arrives
  we patch the stored message with the token/cost info so the UI refreshes automatically (web/src/components/ArcsView.tsx:232-
  274). The effect is entirely fire‑and‑forget, so the button/UI become responsive as soon as the text is written.
  - Scheduler-driven auto replies follow the same pattern—message completion happens immediately, and the retry helper updates
  the message later if stats come through (web/src/components/ArcScheduler.tsx:156-199).
  - Restored the OpenRouter client to its previous fetch behavior (no explicit credentials: 'omit') so it behaves like the
  console test that worked for you (web/src/lib/openrouter/client.ts:67-125).


#### Debugging
  - Open DevTools → Network tab, make sure “Preserve log” is on if the request only fires once.
  - Trigger the failing action once so the request shows up, then find it in the list.
  - Right‑click the row and pick Replay XHR (or Replay fetch in newer Chrome); DevTools will resend the exact request with the
  same headers/body so you can immediately inspect the new response.
  - If you want to modify anything before retrying, choose Copy → Copy as fetch, paste into the Console, tweak, and run—it’ll
  execute in the page context with the same cookies/auth.

In Chrome, right-click the request, then "Copy as fetch", paste into the console, and retry.
- take out the "priority"
- change credentials to "omit"

Example request:
```
fetch("https://openrouter.ai/api/v1/generation?id=gen-1765034883-0qREU60EIK6kbgssBwgR", {
  "headers": {
    "accept": "application/json",
    "accept-language": "en-US,en;q=0.9",
    "authorization": "Bearer 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",
    "content-type": "application/json",
    "sec-ch-ua": "\"Google Chrome\";v=\"141\", \"Not?A_Brand\";v=\"8\", \"Chromium\";v=\"141\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "cross-site"
  },
  "referrer": "http://localhost:5173/",
  "body": null,
  "method": "GET",
  "mode": "cors",
  "credentials": "omit"
});
```
#### Basic version
- web/src/components/ArcsView.tsx:124-330 now memoizes each arc’s cumulative cost by summing the per-message generation
  charges we already capture, and the header renders a “Total cost” badge formatted with the existing helper.
  - web/src/components/ArcsView.module.css:106-138 adds layout/styling for the new header structure so the title, participant
  summary, and badge stay tidy.


### Fix the broken test
- Updated the arc scheduler test to mock sampleIndexFromLogits, drive scheduleNyms, and assert both the logits/probabilities
  and the deterministic nym selections as messages land (web/src/test/arc-scheduler.test.ts:11).

## 2025-12-??
### Improve mobile responsiveness and controls layout
- Keep the arcs list visible on narrow screens and adjust navigation spacing by hiding the brand label on small viewports
- Convert the settings button to a gear icon with accessible labeling
- Reflow OpenRouter auth controls and status banner for small screens to prevent overflow

### Model selector UI changes
  - Nym cards now keep per-model validation state, call the OpenRouter client via getOpenRouterModelIds, and reset
  messaging whenever the model changes so we can highlight the text field green/red only after a check (web/src/components/
  NymsView.tsx:53).
  - The model picker UI now combines a free-text input, inline “Check” button, validation message, and the existing quick-
  select dropdown so users can either type any model or choose from presets without leaving the card (web/src/components/
  NymsView.tsx:161).
  - Added a cached model list helper so the first validation request hits /models and subsequent checks reuse the saved list
  (web/src/lib/openrouter/models.ts:1), plus new CSS hooks for the input row, button, and success/error styles to visualize
  validation results (web/src/components/NymsView.module.css:104).

## 2025-11-30
### Scheduler fixes
- automatic scheduling and sending of messages works
- only user messages get automatic responses (other messages never trigger queue events)
- conversations feel a bit stilted
- system prompts are not good

## 2025-11-29
### Flags
Added a tiny feature-flag helper that centralizes all boolean dev toggles in one place (web/src/lib/devtools/feature-
  flags.ts:1). Flags load once from localStorage, persist automatically, and the window.symposiumFlags object exposes getters/
  setters for every flag that exists in defaultFlags so adding future toggles only requires adding to that single object. A
  legacy-style alias window.__symposiumUseStubbedLLMs was kept for quick boolean flipping.
  - Bootstrapped the helper before React renders so the stored values are ready application-wide (web/src/main.tsx:1).
  - executeChatCompletion now checks the general flag store (getFeatureFlag('stubLLM')) instead of bespoke logic and falls back
  to stubbed text when requested (web/src/lib/openrouter/executor.ts:1).
  - Declared the new globals for TS awareness (web/src/types/globals.d.ts:1).

  Usage: in the browser console run window.symposiumFlags.stubLLM = true (or false) to toggle real LLM calls, or flip
  window.__symposiumUseStubbedLLMs.

  Testing: npm run typecheck.

  Next step idea:

  1. Start the dev server, switch window.symposiumFlags.stubLLM between true/false, and confirm OpenRouter requests pause/
  resume without logging out.

> give me an example of all the places I would need to change to introduce a new flag

To add another flag, you only touch three places:

  - web/src/lib/devtools/feature-flags.ts:3-8 – append the flag name to the FeatureFlag union and add its default value inside
  defaultFlags. The helper reads that object, so no other runtime wiring is needed.
  - Wherever the app should read the flag, import getFeatureFlag('yourFlag') (or setFeatureFlag if the UI needs to flip it) the
  same way the executor now does in web/src/lib/openrouter/executor.ts:1.
  - If TypeScript needs to see the flag on window.symposiumFlags, nothing extra—globals.d.ts references FeatureFlags, so the
  new property appears automatically.

  Once those two code edits are made, window.symposiumFlags.yourFlag becomes available in the console, persists via
  localStorage, and can be consumed anywhere via getFeatureFlag.


## 2025-11-25
### First release!
- Searched the built bundle in web/dist/ for anything resembling common API keys (patterns like sk-, Bearer , accessToken,
  refreshToken, OPENROUTER, odcoda). The only hits (web/dist/assets/index-Dyuemjn9.js:1) are generic status/error strings for
  runtime logic—there are no actual credential values embedded.
  - Tokens are still acquired at runtime via the OpenRouter store. The production bundle only contains references to
  openRouterEnv (see web/src/lib/env.ts:23-36), which read from import.meta.env.* at build time. Because we never set sensitive
  env vars (only OAuth client ID/redirects), nothing secret was inlined.
  - Reminder: if you ever added real secrets to VITE_* env vars they would be baked into dist/, so keep private keys on the
  server side only.

## 2025-11-24
### Deploying the app
#### Planning for github pages
> how can I host this application on github pages? I have a separate <user>.github.io repo already but I'm not sure how to
> actually get this code hosted there

You already have the right target: a <user>.github.io repo. To host this Vite app on that site:

  1. Build the static bundle locally. Inside symposium/web, run npm install (if needed) and then npm run build. That creates a
  dist/ directory containing static HTML/CSS/JS.
  2. Copy the build output into your GitHub Pages repo.
      - In symposium/web/vite.config.ts, make sure base: '/' (or base: '') so paths work at the root.
      - Delete any old contents of <user>.github.io (except .git), then copy everything from symposium/web/dist/ into that
  repo’s root. The simplest approach is rsync -a web/dist/ <path-to-user.github.io>/.
      - Commit and push from the <user>.github.io repo:

        git add .
        git commit -m "Deploy Symposium build"
        git push origin main
  3. Optional automation:
      - Add a script to symposium/web/package.json like "deploy": "npm run build && cp -R dist/* ../<user>.github.io/".
      - Or create a GitHub Action in this repo that builds on push to main, then commits the /dist contents to your Pages repo
  via a personal access token.
  4. Verify. Once the push completes, visit https://<user>.github.io/—GitHub Pages should serve the new build within a minute.

  That’s all you need; GitHub Pages only cares about static files, so the built dist/ tree is exactly what it needs.

> I don't want it in the repo root, but at a specific sub-page that I'm linking to. my github pages already exists and is built
> with jekyll

To serve this Vite build inside an existing Jekyll site (e.g. at https://<user>.github.io/symposium/) you just need to build
  the app with the right base path and drop the dist output into a subfolder that Jekyll doesn’t touch.

  Steps:

  1. Set Vite’s base path for the subpage.
     In symposium/web/vite.config.ts, set base: '/symposium/' (replace symposium with whatever URL segment you plan to use).
  This tells Vite to prepend that prefix to all asset URLs so they resolve correctly when hosted under a subdirectory.
  2. Build the app.
     From symposium/web run:

     npm install        # if you haven’t yet
     npm run build      # honors the base you just set

     You’ll get a web/dist/ folder with the static files.
  3. Copy the build into your Jekyll repo.
     In your <user>.github.io repo, create a folder matching the URL segment (e.g. /symposium/). Copy everything from web/dist/
  into that folder—dist/index.html becomes <jekyll-root>/symposium/index.html, dist/assets/... becomes <jekyll-root>/symposium/
  assets/..., etc. Jekyll will copy any folder without front matter straight through to the output site.
  4. Commit and push the Jekyll repo.

     git add symposium
     git commit -m "Add Symposium build"
     git push origin main   # or whatever branch publishes your site

     When GitHub Pages rebuilds the Jekyll site, it will include the static bundle at https://<user>.github.io/symposium/.
  5. Link to the subpage.
     Anywhere in your Jekyll layouts/posts, link to /symposium/. Because the Vite bundle was built with base: '/symposium/',
  all relative asset URLs will work.

  If you change the folder name later, remember to update the base setting and rebuild before copying the files again.

#### Deploy Workflow

  - web/vite.config.ts:8-15 now pins base: '/symposium/' so every built asset assumes it will live at /symposium/ under your
  Jekyll site instead of the root.
  - Added web/scripts/deploy.mjs which verifies ../odcoda.github.io exists, runs npm run build, and copies the fresh dist/
  output into ../odcoda.github.io/symposium. It hard-codes your username (odcoda) per the request.
  - Hooked the script up via npm run deploy in web/package.json:7-18; running it from web/ will produce the build and sync it
  to the Pages repo, after which you can commit/push from ../odcoda.github.io.

  Run npm run deploy, then from ../odcoda.github.io run git status, commit the updated symposium/ folder, and push to publish.

> if every built asset makes this assumption, will the site still work in dev mode on the same localhost url?

> Yes. Vite ignores the base option when you run npm run dev; the dev server always serves from / and rewrites asset URLs
  dynamically. The base: '/symposium/' setting only affects the contents of the built dist/ files. So local HMR at http://
  localhost:5173/ keeps working exactly as before, while production builds resolve assets under /symposium/.


### Streaming flow
#### Implementation
Streaming + UI Updates

  - executeChatCompletion now drives OpenRouter’s SSE stream: streamChatCompletion was added to the client, chunks are decoded
  as they arrive, and onContentChunk fires per chunk so the UI updates live (web/src/lib/openrouter/{client,executor}.ts).
  Stubbed responses still emit a fake chunk for dev mode.
  - Scheduler changes: each queued request now spawns a placeholder assistant message with status: 'streaming', chunk callbacks
  append to it, and completion/failure flips status + removes the queue item. Request metadata now tracks responseMsgId so
  errors can mark the right message (web/src/types/app.ts, web/src/stores/app-store.ts, web/src/components/ArcScheduler.tsx).
  - Direct “Request response” controls no longer block while a reply streams; you can fire multiple manual requests and see a
  count of in-flight ones (web/src/components/ArcsView.tsx).
  - Auth tweaks: token mapping now handles the actual { key, user_id } payload from OpenRouter, and refresh attempts throw
  immediately (web/src/lib/openrouter/auth.ts, web/src/types/openrouter.ts).
  - Misc: added buffer dependency for PKCE encoding, tightened useOpenRouterClient deps, and allowed PreMsg to carry nymId.

  Validation

  - npm run lint
  - npm run typecheck
  - npm run test
  - npm run build

  (Tried to capture a new Playwright screenshot, but launching Chromium is blocked in the current sandbox, so no fresh artifact
  was produced. You can preview locally via npm run preview -- --host 127.0.0.1 --port 4173.)

  Next Steps

  1. Authenticate and try a conversation: you should see assistant replies stream word-by-word.
  2. Fire multiple manual “Request response” actions—the button stays enabled and counts concurrent requests.
  3. If you need an updated screenshot, run the preview + node scripts/capture-preview.mjs … locally since Playwright can’t
  launch here.

#### Planning
> currently my responses don't stream back; the application seems to just wait for a full response to be received. Can you talk
> me through the current flow that happens after we send a request, to receive it and populate it in the ui? what would we need
> to change to be able to stream replies? I would also like the ui to be fully capable while the response is streaming back.
> currently I see the ui is (correctly) not locked up so I can send more messages, however the "request response" button is
> greyed out so I can't request another message simultaneously

Here’s the flow today:

  1. Queueing: When you press “Send” (or “Request Response”), the composer calls appendMsg to add the user’s message, then
  enqueues one RequestQueueItem per auto-responding nym via queueRequest.
  2. Scheduler loop: ArcScheduler subscribes to the store slices (queue, inFlightIds, settings, nym states). Each time those
  slices change, its useEffect (lines 109–151) recomputes how many slots are free (deriveAvailableSlots) and selects which
  queued requests should launch next (selectRequestsForSlots). For each request, it calls startRequest.
  3. Starting a request: Inside startRequest (lines 49–103):
      - marks the queue item in-flight / markMsgStreaming,
      - builds the prompt by pulling all messages up to the cited message (buildPromptMsgs),
      - prepares the OpenRouter request body (system prompt + chat history),
      - calls executeChatCompletion.
  4. Execution: executeChatCompletion (web/src/lib/openrouter/executor.ts) is currently a simple async helper: if no auth
  client, it waits 800 ms and emits a stub chunk; otherwise it calls client.createChatCompletion, awaits the whole JSON
  response, then calls onContentChunk once with the full message. There’s no streaming or partial UI updates—just a single
  callback when the request resolves.
  5. Completing: After executeChatCompletion returns, startRequest calls appendNymMsg, which creates a new assistant message
  with the final text and marks the original user message complete, then removes the queue item. At that point inFlightIds
  shrinks, so ArcScheduler’s effect runs again and may launch another request.

  That’s why you see the UI idle until the entire response finishes: the executor feeds the scheduler only one chunk.

Streaming changes needed

  - OpenRouter client: Use the streaming endpoint (OpenRouter supports SSE / chunked responses when you set stream: true).
  The client would need to call fetch with { signal, body, headers } and then iterate over response.body as a ReadableStream,
  decoding each chunk.
  - Executor: Instead of waiting for response.json(), parse the SSE stream and invoke onContentChunk whenever a chunk arrives.
  Accumulate the text so the final result still has the full message, but call the callback after every chunk so the UI
  can update incrementally. For models that emit “reasoning” tokens, you could add another callback (onReasoningChunk). The
  executor should resolve only when the stream closes or aborts.
  - Store/UI updates: Right now appendNymMsg is only called once at the end. To show streaming text, you’d:
      1. Insert a placeholder message (status streaming, empty content) when the request starts.
      2. In each onContentChunk, call updateMsg to append the new chunk to that placeholder’s content.
      3. When the stream completes, flip the status to complete and optionally store metadata.

    The scheduler already calls markMsgStreaming(request.msgId) for the user message; you’d need a similar placeholder for the
  assistant reply (maybe “active message id” stored alongside the queue item).
  - Concurrency button: The “Request Response” button is disabled because the store marks the queue item in-flight until the
  request finishes; the composer probably checks scheduler.inFlightIds or the queue status to avoid duplicate requests (look
  for a disabled={something === 'authorizing'} pattern in the composer). To allow multiple simultaneous requests you can:
      - Keep the button disabled only while its specific request is queued, but allow new user messages regardless of existing
  in-flight ones.
      - Respect settings.maxConcurrent in the scheduler (already does) but don’t block the composer—just queue the new request
  even if it can’t start yet.

  In short: the scheduler already lets multiple requests run (up to maxConcurrent), but the UI disables the “request response”
  button as soon as the message is sent. If you want that button usable even while earlier responses stream, change the
  composer’s disabled condition to ignore queue/in-flight state (or only disable while the text area is empty). Streaming
  requires changes in executeChatCompletion and the scheduler to process chunks and update the target message progressively.

### Manual fixes
- auth expiration isn't checked to avoid the bug where it always thinks it expired (because null <= (any Date.now()) by numerical conversion)
- added some free models -- it works now!
- need to fix streaming

## 2025-11-22
### More auth fixes
#### Store the key correctly
(fixed manually)

> I notice the OpenRouter client expects the token response to have fields like access_token, refresh_token, token_type,
> expires_in, etc, but the actual response I got back from openrouter just has two fields: key and user_id. Is that ok? should
> I be worried?

OpenRouter’s PKCE flow is a bit unusual: when you POST to /api/v1/auth/keys you don’t get an OAuth-style access_token /
  refresh_token pair. Instead (as you saw) the payload is:

  { "key": "sk-…", "user_id": "usr_…" }

  That response just hands you a permanent API key tied to the signed-in user. There’s no expiry, no refresh token, and the
  token_type is effectively “Bearer”.

  So, yes, the code in openrouter/auth.ts:49 that expects access_token/expires_in is incompatible. We should adjust
  OpenRouterTokenResponse and mapTokenResponse to treat key as the access token, mark expiresAt far in the future, and drop
  refresh logic. Having only key/user_id isn’t a security concern—that’s simply how OpenRouter’s PKCE endpoint works. We just
  need to map those fields correctly:

```
  const mapTokenResponse = (response: { key: string }) => ({
    accessToken: response.key,
    refreshToken: null,
    tokenType: 'Bearer',
    scopes: [],
    expiresAt: Number.POSITIVE_INFINITY,
  })
```

  Then OpenRouterClient can keep using Authorization: Bearer {key} headers. In short: the unexpected response format is normal
  for OpenRouter; we just need to update our client code to match it.

#### Automatic sign out
(fixed by commenting it out)

The auto-sign‑out happens because our OpenRouter client deliberately invokes the onUnauthorized callback whenever it sees a
  401 (or an already-expired token), and the hook wires that callback to clearTokens().

  - web/src/lib/openrouter/client.ts:33-72 – inside buildHeaders and request, we call this.onUnauthorized?.() if the access
  token is expired or if fetch returns response.status === 401, then throw an “OpenRouter … unauthorized” error. That callback
  is our “sign out” hook.
  - web/src/hooks/useOpenRouterClient.ts:14-29 – when constructing the client we pass onUnauthorized: () => { clearTokens() }.
  Clearing tokens drops us back to the signed-out state.

  So any unauthorized response triggers that code path, which wipes tokens and effectively signs the user out.

### Error reporting fixes
- Kept scheduler failures from overwriting message bodies by resetting status details on stream start and storing error text
  in statusDetails only (web/src/components/ArcScheduler.tsx:33-61). The direct-request path now follows the same pattern so
  partial content stays intact even when an OpenRouter call fails (web/src/components/ArcsView.tsx:125-207).
  - Reworked each message card to include a Delete button tied to the store, plus a dedicated red status line that renders any
  error details below the bubble while the existing status pill still shows the lifecycle (web/src/components/ArcsView.tsx:263-
  285, web/src/components/ArcsView.module.css:125-174).
  - Added supporting styles for the new controls and ensured streaming updates clear stale status text so retries don’t inherit
  old errors.

- The stub text comes from executeChatCompletion falling back when no OpenRouter client is configured. See web/src/lib/
  openrouter/executor.ts:18-41: if client is null it runs sleep, appends (${request.model}) Stubbed response for development.
  via onContentChunk, and returns that string. That’s why you see “Stubbed response…” in the message body even when an error
  occurs later—the content stream completed successfully, so we never trip the error path.

  Error details are only populated in two places right now:

  - Scheduler-driven responses: failRequest in web/src/components/ArcScheduler.tsx:54-61 calls updateMsg(request.msgId,
  { status: 'error', statusDetails: error }).
  - Manual direct requests: the catch path in web/src/components/ArcsView.tsx:198-206 sets statusDetails when
  executeChatCompletion throws.

  If the call doesn’t throw (e.g., we get the stubbed content), those branches never run—so there’s no error to render. To make
  your status line useful while testing with the stub, you’d need to simulate an error (e.g., modify the executor to throw) or
  surface some other metadata.

  Once you have a real client hooked up, the error-handling paths above will populate statusDetails, and ArcsView will render
  it via the msg.status === 'error' check (web/src/components/ArcsView.tsx:280-284).

### Manual message button

  - web/src/components/NymsView.tsx:10-173 – handleAddNym now hydrates every newly created nym using the UI defaults (model,
  prompt, sliders, mention/politeness knobs, color palette), so cards start with consistent values and all inputs stay
  controlled.
  - web/src/components/ArcsView.tsx:1-309 – added direct-response controls to the conversation view: we track the selected nym,
  call OpenRouter immediately via executeChatCompletion, stream chunks into a placeholder assistant message, and update its
  status to complete/error without touching the scheduler queue. Any issues bubble up in-line through a small error banner.
  - web/src/components/ArcsView.module.css:125-174 – styled the new selector/button row to match the existing panel chrome and
  added a subtle error state.

#### how does the flow work?
 Here’s what happens when executeChatCompletion runs (see web/src/lib/openrouter/executor.ts:19):

  1. Function is invoked with { client, request, signal, onContentChunk }.
  2. Client missing? If client is null (no OAuth tokens yet), it waits ~800 ms, calls onContentChunk with a stub string, and
  returns { response: null, content: fallback }. The caller sees an immediate “fake” reply but no actual API call.
  3. Abort check: If an AbortSignal was provided and already aborted, it throws before making a request.
  4. OpenRouter call: Calls client.createChatCompletion(request) (which wraps fetch to https://openrouter.ai/api/v1/responses),
  awaiting the JSON response.
  5. Process content: Reads the first choice’s message content (response.choices[0]?.message?.content). If it’s non-empty, it
  invokes onContentChunk with that text—this lets the caller append streamed text as soon as it’s available (even though this
  stub just sends one chunk).
  6. Return: Resolves with { response, content } so the caller can inspect metadata (token counts, ids) if needed.

  In ArcScheduler (web/src/components/ArcScheduler.tsx:82), executeChatCompletion is awaited inside startRequest. Each chunk
  callback concatenates text into assembledContent; when the promise resolves, the scheduler inserts a new assistant message
  with that content and marks the queue item complete. If client is real, the callback fires once per API response (or per
  chunk when streaming support is added); if client is null, it still simulates a chunk so the UI updates.

### Default nym creation moved to View

  - Added explicit defaults for every UI-controlled nym field plus a color palette so we can build a complete PreNym payload
  when creating a card (web/src/components/NymsView.tsx:10-38).
  - handleAddNym now derives the next index, applies those defaults, cycles a color, and passes the full set of parameters to
  createNym, keeping the sliders/inputs controlled as soon as the card appears (web/src/components/NymsView.tsx:166-173).

### More basic JS

> how do I raise an assertion in JS?

JavaScript doesn’t have a built‑in assert keyword, so you just throw an error when a condition isn’t met. A common pattern is
  to write a tiny helper:

  export function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
    if (!condition) throw new Error(message)
  }

  // usage
  assert(msg.authorRole === 'user', 'Expected user role')

  In Node you can also use the built-in node:assert module (import assert from 'node:assert') or console.assert, but for
  browser code, the manual helper (or a small assertion library) is the usual approach. Throwing an Error halts execution and
  surfaces the stack trace right where the invariant failed.

> what's the difference between function foo(x, y, z) { ... } and const foo = (x, y, z) => {...}? I've been seeing the latter a
> bunch

They’re both function definitions, but there are a few differences:

  1. Hoisting: function foo() {} declarations are hoisted—you can call them before they appear in the file. Arrow functions
  assigned to const foo = () => {} aren’t hoisted the same way; the variable is hoisted but uninitialized until that line runs,
  so calling foo() before the assignment throws.
  2. this binding: Regular functions have their own this, determined by how they’re called (obj.method(), new Foo(), etc.).
  Arrow functions don’t have their own this; they capture the this of the surrounding scope. In React components/hooks, arrows
  are handy because they avoid this entirely.
  3. arguments and new: Regular functions get the arguments object and can be used as constructors with new. Arrow functions
  don’t have arguments and can’t be used with new.

  Otherwise, they behave the same for most cases. In modern React/TypeScript code, the arrow form is idiomatic because it’s
  concise, plays nicely with closures, and avoids confusing this behavior. Use the function keyword if you need hoisting, new,
  or dynamic this.
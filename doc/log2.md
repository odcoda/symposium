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
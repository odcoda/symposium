▌ when does useEffect get called on a react component?

> useEffect runs after React commits your component’s render to the DOM. The timing depends on the dependency array:

  - No dependency array (useEffect(fn)): runs after every render (initial mount + every update), and the cleanup (if returned)
  runs before the next effect or when the component unmounts.
  - Empty dependency array (useEffect(fn, [])): runs only once after the first render (mount), with cleanup running on unmount.
  - Specific deps (useEffect(fn, [a, b])): runs after the first render and then again whenever any dependency changes value
  between renders; cleanup runs before re-running and on unmount.

  In React 18 StrictMode (development), effects run twice on mount to help catch unsafe patterns, but in production they follow
  the rules above.

▌ so if my scheduler loops over its requests in useEffect, isn't that bad? won't it only attempt to schedule once per render?
▌ I'm confused about ArcScheduler.tsx in particular

> useEffect doesn’t “loop” on its own—it runs after React commits a render, then only re-runs when one of the values in its
  dependency array changes. That’s exactly what the scheduler is exploiting.

  Take web/src/features/conversations/components/ConversationScheduler.tsx: the effect near the bottom depends on [queuedItems,
  settings.autoStart, startRequest]. React reruns that effect every time any of those values changes—i.e., when the queue
  gains/removes items, when autoStart flips, or when startRequest’s closure changes (which itself tracks the queue via
  zustand). Inside that effect the scheduler inspects the latest queue, computes available slots, and launches requests. Later,
  when a request finishes, the store updates (updateQueueItem, removeQueueItem), React sees the queue changed, re-renders the
  scheduler component, and the effect runs again—so it schedules the next batch.

  So even though the scheduling loop lives inside a useEffect, it isn’t limited to “once per render”. Each time the queue or
  relevant settings change, React re-executes the effect, giving the scheduler a fresh chance to dispatch more work.

▌ hang on, look at the code, I think it's changed

> You’re right that ArcScheduler has evolved, but the scheduling loop still lives inside useEffect, and it still fires every
  time any of its dependencies change:

  useEffect(() => {
    …
  }, [
    inFlightCount,
    nymStates,
    nyms,
    queuedItems,
    settings.autoStart,
    settings.maxConcurrent,
    settings.selectionTemperature,
    startRequest,
  ])

  React reruns this effect whenever the queue, in‑flight count, settings, or nym info changes. Each startRequest call updates
  the zustand store (markRequestInFlight, updateQueueItem, appendMsg, removeQueueItem), which changes queue/inFlightIds. That
  triggers a re-render, React recomputes queuedItems/inFlightCount, and the effect runs again, so the scheduler immediately
  notices freed slots and dispatches more work.

  So even though the scheduler loop sits in useEffect, it isn’t a one-shot. It reacts to store changes:

  1. User action enqueues a request → queue changes → effect runs.
  2. Scheduler starts a request → inFlightIds changes → effect runs (and can pick additional requests up to maxConcurrent).
  3. Request completes → queue/in-flight change again → effect runs to keep draining the queue.

  If your effect ever “sticks” (e.g., the button stayed disabled earlier), it’s because a dependency stopped changing—like
  the status never leaving "authorizing". But during normal operation the effect reexecutes on every relevant update, so the
  scheduler keeps running without needing a manual loop.

▌ why does it depend on all these things? doesn't that make it slow and require lots of re-renders? it feels like it should
▌ just run every once in a while...

> The dependency list may look long, but each item is there so the scheduler reacts precisely to the state that matters:

  - queuedItems: when new requests are enqueued or old ones finish, the effect must re-run to dispatch more work.
  - inFlightCount: keeps concurrency limits accurate—if an in-flight request completes (or errors), the effect reruns so freed
  slots can be reused immediately.
  - settings.autoStart, settings.maxConcurrent, settings.selectionTemperature: if the user tweaks these sliders, the effect
  recomputes with the new limits; otherwise you’d need a manual poll.
  - nyms, nymStates: personality metadata (model, prompt, participation) or dynamic state informs the selection. If that
  changes, you want the scheduler to choose participants with the latest info.
  - startRequest: the callback closes over openRouterClient and queue state; if those change, React treats it as a new function
  and reruns the effect to keep everything in sync.

  Re-running an effect isn’t expensive by itself—the heavy work (OpenRouter calls) happens only when actual requests need to be
  started. Each effect execution just checks a few arrays and (maybe) kicks off async work. React already has to re-render when
  the queue or settings change; the effect piggybacks on that by coordinating side-effects after the render.

  Poll-based schedulers (run “every once in a while”) introduce latency and require timers. By wiring the effect to the
  specific state slices, we get immediate responses with no extra polling or renders: the function only runs when something
  relevant actually changed. If we discover certain dependencies rarely matter, we can memoize or tighten selectors, but
  removing them outright would risk stale scheduling decisions.

▌ how does react actually do all this? I'm usually pretty good at understanding these systems from the ground up but I'm really
▌ confused by how react states and effects work. like how does the react implementation actually work?

> At a high level, React maintains a tree of “fiber” nodes representing your component hierarchy. Each fiber stores the
  component’s props, state hooks, pending effects, and references to DOM nodes (or child fibers). When something changes—new
  props from a parent or a setState/store subscription—React schedules an update:

  1. Render phase (reconciliation): React walks the fiber tree, calling each component function to produce a new “virtual”
  description. Hooks like useState return the current values from the fiber and record updates. useEffect just queues the
  effect for later; it doesn’t run during render. React compares the new output to the previous one to calculate what needs to
  change (diffing).
  2. Commit phase: Once the render pass finishes, React applies DOM mutations and then runs side-effects. Effects with
  useLayoutEffect run immediately after DOM updates; useEffect callbacks run asynchronously after the browser paints. Cleanup
  functions run before the next time the effect fires or when the component unmounts.

  Because React re-executes your component functions on every render, states/effects are keyed by the order hooks are called.
  Each useState stores its value in the fiber, and calling the setter schedules another render. Dependencies for useEffect
  are stored alongside it; React shallow-compares the array (or lack of one) to decide whether to queue the effect during the
  commit phase.

  In our case, Zustand triggers setState, React sees the subscribed slices changed, re-runs the component, and the effect gets
  re-queued with the latest dependency values. After the render commits, React runs the effect, which can kick off schedulers,
  network calls, etc. That’s why you see the effect re-running whenever the queue or settings change—it’s React’s commit cycle
  responding to state updates and rerunning the queued effect callbacks.

▌ can you explain this a bit mroe low level? like concretely what is react doing to get this tree?

> Under the hood React keeps a linked tree of “fiber” nodes, one node per component (function or host DOM node). Each fiber
  has pointers to its parent, first child, and next sibling, plus bookkeeping like the component’s type, props, state hooks,
  pending effect list, and a pointer to the actual DOM node if it represents <div>/text.

  When an update occurs (props change, you call setState, or a store subscription fires), React doesn’t mutate the existing
  fiber tree in place. Instead it builds a work-in-progress tree by walking the current tree:

  1. Initialize work: React clones the root fiber (the entry point) and pushes it onto a stack. This clone shares the same
  alternate pointer with the previous fiber so React can compare “old” vs “new” later.
  2. Render traversal (reconciliation): React pops fibers off the stack and runs the component function associated with the
  fiber. For a function component, it calls the function, executing hooks in order. Each useState/useReducer returns the value
  stored on the previous fiber, and any dispatch enqueues an update for the next pass. The function returns JSX, which React
  turns into child fibers: it diff-matches the returned elements against the previous children to decide whether to reuse or
  create new fibers, links them into the work-in-progress tree, and pushes them onto the stack.
  3. Collect effects: While building fibers, React notes any useEffect/useLayoutEffect hooks. It doesn’t run them yet; it just
  records the callbacks and their dependencies.
  4. Commit phase: Once the entire work-in-progress tree is built, React compares it to the current tree. For host nodes (DOM
  elements), it builds a list of DOM mutations (insert, update props, delete). After applying these to the real DOM, React runs
  the effect lists: layout effects first (synchronously), then useEffect callbacks asynchronously.
  5. Swap trees: The work-in-progress tree becomes the new “current” tree; each fiber’s alternate pointer flips so future
  updates can diff against the latest tree without reallocating everything.

  Because components are just pure functions over props/state, React can re-run them whenever needed. The hook system ties
  state/effect slots to the fiber so React knows which useState call corresponds to which value. That’s why hooks must run
  unconditionally in the same order—React relies on the call order to map hook positions to entries in the fiber.

  So when the scheduler queue updates, React marks the affected fibers dirty, builds a fresh work-in-progress tree where
  ArcScheduler re-runs with the new queue props, and then in the commit phase it re-queues the useEffect, which runs
  immediately after the DOM update. No continuous loop needed—the tree rebuild + commit is what keeps everything in sync.

▌ and you said "when an update occurs" -- I suppose this can happen when the user changes something, but what's up with these
▌ store subscriptions?

> Right—there are two main ways a component ends up re-rendering:

  1. React-managed state/props: When a parent passes new props or you call a hook setter (setState, useReducer dispatch), React
  schedules an update automatically.
  2. External subscriptions: Libraries like Zustand or Redux maintain their own stores. When you call useAppStore(selector)
  (Zustand’s hook), it subscribes the component to the store. Internally, that hook registers a listener—so whenever the
  store’s state changes, Zustand runs the selector and, if the selected slice is different, calls React’s setState under the
  hood. That setState is what triggers the React update cycle for the subscribing component.

  So even though the scheduler’s data lives in a store, the moment the store mutates (e.g., queue changes), the hook’s
  subscription notifies React, React schedules an update, and ArcScheduler re-renders with the new queue slice. That render
  queues the useEffect again, so the scheduler reacts to the changed store just like it would to a normal useState update.

▌ how about useMemo?

> useMemo caches the result of a calculation between renders. On each render, React compares the dependency array you pass
  (useMemo(fn, deps)). If none of the dependencies changed, React reuses the previously computed value without re-running fn.
  If any dependency changed (or there’s no dependency array), React calls fn again and stores the new result.

  It’s purely an optimization: it doesn’t prevent renders or side effects, and React may discard a memoized value under memory
  pressure (so fn might run even if deps look unchanged, though that’s rare). You typically use useMemo when either:

  - The calculation is expensive (e.g., sorting/filtering large data), and you don’t want to recompute on every render.
  - You need referential stability—returning the same object/array instance unless inputs change—so downstream hooks
  (useEffect, useCallback, memo) don’t rerun unnecessarily.

  In the scheduler, useMemo(() => queue.filter(...), [queue]) ensures that React only recomputes the filtered list when the
  underlying queue slice actually changes. Without it, each render would produce a new array identity even if the contents were
  the same, causing the effect that depends on queuedItems to fire more often. useMemo keeps that dependency stable unless the
  queue actually differs.

▌ ah I see so I should think of useMemo as basically being like useState but optimized. and I should think of each useState,
▌ useMemo, or useAppStore as kinda saying "this is a dependency of the current thing I'm rendering"? is that reasonable?

> Pretty much:

  - useState stores mutable state inside the component. Every time you read it in the render function, React “knows” the
  component depends on that state; if you call the setter, React triggers a re-render of the component.
  - useAppStore(selector) (Zustand) subscribes the component to an external state slice. Conceptually it behaves like useState:
  whenever the selected slice changes, the hook’s internal setState causes React to re-render the component.
  - useMemo isn’t a dependency by itself—it wraps a derived value. You use it so that downstream dependencies (like an effect
  or a memoized child) see a stable reference unless the inputs change. So it doesn’t mark dependencies; rather it consumes
  them and re-computes when they change.

  You can think of the render function as declaring “this component depends on these hooks’ values”. When any of those values
  change—whether from useState, a store subscription, or props—React schedules a re-render, and everything downstream (effects,
  memoized values) is reconsidered with the new inputs. useMemo just helps avoid recalculating or churning references when
  nothing relevant changed.

▌ you keep saying 'hooks' -- dumb question -- which things are hooks?

> In React, “hooks” are the functions whose names start with use... and that you can only call at the top level of a function
  component (or inside custom hooks). They’re the API React gives you for interacting with its runtime—storing state, running
  effects, memoizing values, accessing refs, subscribing to context, etc. Examples:

  - Core hooks: useState, useReducer, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useContext, useTransition, etc.
  - Custom hooks: any function you write that itself calls hooks (e.g., Zustand’s useAppStore, useOpenRouterClient,
  usePrevious). These follow the same rules (names start with use, call other hooks at the top level).

  Hooks are how React tracks dependencies. When your component calls useState or useAppStore, React notes that it depends on
  that value; when the value changes, React re-runs the component. Hooks like useEffect and useMemo also accept dependency
  arrays so React knows when to re-run an effect or recompute a memo.

  So whenever you see a useSomething call in a component, that’s a hook, and it’s contributing to how React schedules renders
  and manages state/effects.

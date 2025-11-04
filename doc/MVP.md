# MVP Implementation Plan

1. **Tooling & Project Setup**
   - Initialize a single Vite + React + TypeScript application and configure ESLint, Prettier, and Vitest/Testing Library.
   - Add path aliases and basic absolute import support; set up environment variable handling for OpenRouter OAuth keys.
   - Establish a lightweight UI kit (Tailwind or CSS Modules) and shared component folder structure.

2. **Domain Modeling & State Management**
   - Define TypeScript interfaces for `Personality`, `Conversation`, `Message`, and scheduler metadata.
   - Use Zustand (or Redux Toolkit) to manage in-memory state; include slices for personalities, conversations, UI flags, and LLM request queue.
   - Persist essential state (personalities, conversations, preferences) to `localStorage` with versioning/migration helpers.

3. **Global Layout & Navigation**
   - Create responsive layout with top-level navigation between Conversations view and Personalities view (plus a simple settings modal).
   - Implement mobile-first drawer/tabs to switch between views, ensuring chat remains primary on smaller screens.
   - Add global toasts/spinners for LLM activity feedback.

4. **Conversation Workspace**
   - Build chat timeline showing message bubbles, speaker avatars/colors, timestamps, and streaming text placeholders.
   - Implement composer for user messages with Markdown preview and quick personality targeting controls.
   - Add start/stop buttons that control an in-flight request queue and cancel ongoing OpenRouter fetches.

5. **LLM Request Pipeline**
   - Implement OpenRouter OAuth PKCE flow entirely in the browser; store access tokens in memory and refresh when needed.
   - Compose request payloads per personality by prepending system prompt, short memory summary, and recent conversation context (windowed trimming).
   - Support streaming responses via `fetch` with ReadableStream; update timeline incrementally and finalize messages on stream completion or cancellation.
   - Provide basic throttling: limit concurrent requests, add small delay between queued calls, and expose a global "response pacing" slider.

6. **Personality Management**
   - Create personality list (cards) with add/duplicate/delete operations; store prompt, model selection, temperature, eagerness, and memory notes.
   - Build detail editor with sliders/inputs and validation messaging; auto-save edits with debounce and rollback option.
   - Surface per-personality participation toggles (e.g., allow auto replies) and preview of system prompt summary.

7. **Lightweight Settings**
   - Provide a global settings modal for default model, max concurrent responses, streaming speed preference, and auto-start chat toggle.
   - Persist settings in local store and ensure changes immediately affect conversation scheduler.

8. **In-Memory Memory Management**
   - Track personality-specific short-term memory snippets and append notable user summaries; allow manual pruning in UI.
   - Include per-conversation checkpoints to mark important context for future prompt construction.

9. **Error Handling & Offline Support**
   - Gracefully handle OpenRouter errors (auth, rate limiting) with retry banners and guidance; fall back to manual re-auth when tokens expire.
   - Detect offline state to pause auto-responses and queue user messages until connectivity resumes.

10. **Testing & QA**
   - Write unit tests for state slices, persistence adapters, and request scheduler logic (mocking timers and fetch).
   - Add component tests for chat timeline, personality editor, and settings modal; include integration test covering OAuth handshake (mock endpoints).
   - Run manual exploratory sessions focusing on streaming interruptions, cancel/start controls, and local storage migrations.

11. **Packaging & Deployment**
   - Configure build output for static hosting; add GitHub Actions workflow to lint, test, and build on pushes.
   - Document env setup, OAuth callback configuration, and deployment steps (e.g., Vercel/Netlify) in README.
   - Provide user onboarding guide covering OAuth login, creating personalities, and starting conversations.


# Implementation Plan

1. **Repo & Tooling Setup**
   - Initialize a top-level workspace with npm or pnpm; configure TypeScript, ESLint, Prettier, and Vitest for shared lint/test defaults.
   - Create `apps/client` for the React UI and `apps/server` for the Express API; add a `packages/shared` folder for TypeScript types and utility helpers consumed by both sides.
   - Set up environment variable management (`.env`, `.env.local`), including Clerk keys, OpenRouter OAuth metadata, and database DSNs; document required secrets in `README`.

2. **Database Layer (Postgres + Hand-Rolled SQL)**
   - Define SQL DDL files describing tables for users, personalities, personality memories, projects, files, file revisions, conversations, messages, settings, comments, and sync metadata (timestamps/version counters).
   - Write `scripts/migrate.ts` that reads the DDL files and applies them sequentially using `pg` with transactional safety and idempotent checks; include rollback helpers for local development.
   - Seed development data with SQL scripts (`scripts/seed.ts`) that insert demo users, personalities, conversations, and sample projects for quick end-to-end testing.

3. **Express Backend Foundation**
   - Set up `apps/server` with TypeScript, Express, and `pg` connection pooling; add request logging (pino) and error-handling middleware.
   - Implement Clerk middleware to validate bearer tokens on incoming requests; map Clerk user IDs to internal user records, creating them on first login.
   - Establish input validation using Zod schemas shared through `packages/shared`, ensuring strict typing between client and server.

4. **Data Access & Services (No ORM)**
   - Write thin repositories that encapsulate SQL queries (select/insert/update) for each entity, returning typed DTOs; include optimistic concurrency via `updated_at` or `version` columns.
   - Create service modules combining repositories into higher-level operations (e.g., syncing a project, creating a conversation message with history snapshots).
   - Add a lightweight query builder helper for repetitive SQL fragments (WHERE clauses, pagination) while keeping raw SQL readable.

5. **API Design & Endpoints**
   - Implement REST endpoints grouped by domain: `/settings`, `/personalities`, `/projects`, `/files`, `/conversations`, `/messages`, `/comments`, `/sync`.
   - Provide batch endpoints (`/sync/full`, `/sync/deltas`) that deliver all state needed by the client on startup and accept client-side updates (with conflict detection).
   - Implement SSE or WebSocket channel for near-real-time push of updates so multiple clients stay in sync; include heartbeats and reconnect logic placeholders.
   - Add rate limiting and request size guards, especially for file revisions and conversation payloads.

6. **CLI Tooling**
   - Build `apps/cli` (Node + TypeScript) that authenticates via Clerk (service tokens or OAuth device flow) and calls server endpoints to dump/import data.
   - Implement commands: `sync` (download settings/content as JSON + file tree), `export` (create archive), `import` (upsert from JSON), and stub `run` for future “CLI mode”.
   - Ensure CLI writes to local filesystem hierarchies matching project/file structure, handling revision history exports.

7. **Frontend Infrastructure (React + Vite + TS)**
   - Scaffold Vite React app with TypeScript, React Router, Zustand or Redux Toolkit for state, React Query for server communication, and Tailwind or CSS Modules for styling.
   - Integrate Clerk React components for authentication (sign-in/up, session management) and store the auth token for API calls.
   - Set up data normalization layer (entities + selectors) to hydrate from `/sync/full` response and merge deltas optimistically.

8. **Initial Load & Sync Workflow**
   - On login, fetch full sync payload, populate client stores, and establish SSE/WebSocket subscription for updates.
   - Implement optimistic update helpers that stage local changes, call corresponding endpoints, and reconcile with server responses (resolving conflicts using version fields).
   - Add background sync loop that periodically requests deltas and flushes pending updates when offline changes occur.

9. **Conversation Experience**
   - Build chat timeline components with message bubbles, participant avatars, timestamps, and streaming text support; include start/stop buttons that manage in-flight requests.
   - Implement request scheduler that enforces max concurrent LLM calls, configurable delays, and PID-inspired throttling to balance response rates.
   - Handle streaming OpenRouter responses (using fetch + ReadableStream) to allow mid-stream interruption and message assembly; surface partial text in UI.
   - Record conversation messages locally and persist them through `/messages` endpoint, updating conversation history in sync store.

10. **OpenRouter OAuth Integration**
   - Implement PKCE client in the frontend to obtain OpenRouter access tokens; securely store tokens in memory and refresh as needed.
   - Fetch available models for selection in personality editor; map model capabilities to UI (temperature ranges, tool support, etc.).
   - Compose requests per personality: prepend system prompt + memory files, tag speaker metadata, and send context-trimmed conversation history.

11. **Personality Management UI**
   - Create personality list and detail views showing model selection, prompt editor, and sliders for eagerness, temperature, reasoning, response delay, etc.
   - Implement validation and auto-save behavior that debounces changes and syncs via `/personalities` endpoints; show change indicators and revert controls.
   - Surface inter-personality relationship settings (e.g., attitudes toward others) with structured editors and explanatory tooltips.

12. **File Workspace**
   - Integrate a text editor (Monaco or CodeMirror) with syntax highlighting, undo/redo, and collaborative cursors placeholders; show revision metadata.
   - Display inline comment markers and proposed edit highlights; clicking reveals side-panel thread with message history.
   - Allow creating/editing comments and proposed changes, persisting via `/comments` and `/files/revisions` endpoints.
   - Provide project/file navigator mirroring backend structure, with breadcrumbs and mobile-friendly toggle.

13. **LLM Tools & Comment Orchestration**
   - Define tool schemas (read file, propose edit, add comment) exposed to LLM participants when conversation scope targets a document.
   - Ensure tool invocations trigger backend operations (e.g., storing proposed edits) and update UI in real time; log tool usage in conversation history for auditing.
   - Add prompt helpers that summarize outstanding tasks and include relevant file snippets when generating LLM requests.

14. **Global Settings & Controls**
   - Build settings panel for conversation-wide controls (max concurrency, delay, typing speed target) and default personality parameters (model quotas, memory usage).
   - Implement toggles for conversation transformation rules (e.g., re-tagging messages as user/assistant) and persist selections through `/settings` endpoints.
   - Ensure settings propagate to scheduler and LLM request pipeline immediately after changes.

15. **Testing & Quality Assurance**
   - Write unit tests for SQL repositories using a disposable Postgres database (via Docker test container) and fixtures for key entities.
   - Implement API integration tests (Supertest) covering auth, sync flows, conversation creation, and file revisions; mock OpenRouter interactions.
   - Add frontend component tests (Vitest/Testing Library) and e2e flows (Playwright) for auth, sync, chat, personality edit, and file commenting.
   - Include load/stress scripts (k6 or autocannon) to validate conversation concurrency and sync under pressure.

16. **Deployment & Ops**
   - Create Dockerfiles for client (static build) and server (Node runtime) plus docker-compose for local dev with Postgres.
   - Configure CI pipeline (GitHub Actions) to lint, test, build, and package artifacts; publish migration scripts and seed data as part of build.
   - Define infrastructure-as-code (Terraform or Pulumi) to provision Postgres, server host, static asset hosting, and environment secrets.
   - Document operational runbooks (deploy, rollback, rotating keys, handling OpenRouter rate limits) in `/docs`.


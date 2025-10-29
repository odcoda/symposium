- Establish baseline stack: pick backend (e.g. Node/Express + Prisma + Postgres) and front end (React + Vite/Next +
  TypeScript), configure Clerk for auth, set up monorepo tooling with shared types, linting, formatting, env management.
  - Model data layer: design SQL schema for users, personalities, personality memories, projects, files, file revisions,
  conversations, messages, settings; generate Prisma models and migrations; seed with sample data and Clerk user linkage.
  - Build backend service: scaffold Express app with Clerk JWT validation middleware, CRUD REST/GraphQL endpoints for all
  entities, bulk sync endpoints (initial load + incremental upsert), optimistic locking/version fields, streaming support
  placeholders, plus OpenRouter OAuth token exchange passthrough.
  - Implement sync workflow: on login fetch settings/content snapshot, persist updated_at markers, expose delta endpoints for
  push-from-client; add background workers/webhooks to persist changes received from clients and broadcast via websockets/SSE
  for multi-device coherence.
  - Create CLI tooling: build Node/TS CLI that authenticates with Clerk, requests server dumps (settings JSON + project file
  trees), writes to local FS, supports diff/export/import commands, and stubs future “CLI mode” operations.
  - Architect front-end shell: set up routing/layout for desktop & mobile (conversation, personalities, files views), implement
  responsive navigation drawer listing conversations, projects/files, and personalities with search/filter state derived from
  server snapshot.
  - Implement authentication & initial load: integrate Clerk React SDK (sign-in/sign-up), handle token refresh, load user data
  via sync endpoints, cache in client store (React Query/Zustand) with normalized entities and optimistic updates.
  - Build conversation interface: compose chat timeline component with streaming message support, start/stop controls,
  cancellation handling, typing indicators; manage in-flight request queue with configurable concurrency, delay scheduler, and
  throttling PID controller stub.
  - Integrate OpenRouter messaging: obtain OAuth token via PKCE flow, request model metadata, maintain per-personality system
  prompt + memory composition, send chat completions directly from client, update histories, and handle interruptions/responses
  merging.
  - Develop personality editor: create form with sliders (eagerness, temperature, reasoning, response delay), model selector,
  prompt editor with validation, auto-save to backend, and preview of inter-personality attitudes.
  - Build file workspace: implement text editor (Monaco/CodeMirror) with comment threads, proposed edits, highlight overlays;
  connect to conversation context so LLMs can comment/edit via tools; add revision timeline viewer referencing stored file
  histories.
  - Add comment/review orchestration: allow LLM actions to create comments or edits through tool exposure, surface outstanding
  tasks in UI, and ensure conversation prompts include relevant file excerpts/memory as specified.
  - Implement settings management: expose global conversation controls (N in-flight limit, delay, typing speed target),
  personality defaults, and model quotas; persist changes via sync API and reflect across sessions.
  - Provide testing & QA: write unit tests for data models and reducers, integration tests for API endpoints, mock OpenRouter
  interactions, e2e flows (auth, sync, chat) using Playwright; add load test scripts for concurrency logic.
  - Prepare deployment: configure env vars (Clerk, OpenRouter, DB URLs), set up Dockerfiles and compose for local dev, define
  CI pipeline (lint/test/build), produce infra-as-code (Terraform) for hosting backend + Postgres + object storage, and
  document deployment/playbook.

  Next steps: 1) Align on tech stack choices (Express vs. alternative, ORM). 2) Confirm schema/entity naming. 3) Prioritize
  which UI flows to prototype first.

▌ use react + typescript, don't bother with nextjs. on the back end, express is good, but don't bother with orm because the db
▌ is very simple. just hand-roll it. change the plan accordingly and write it down in PLAN.md


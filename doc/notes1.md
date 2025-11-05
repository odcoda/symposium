## Basic Development

  0. Node Version Management

  - Before working, ensure you’re on Node 22: nvm use 22.
  - If you open a new shell, node --version should show v22.21.1.

  1. Start Dev Server for Live Editing

  - From web/, run npm run dev.
  - in chrome, open https://localhost:5173
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

## Upgrading cached state
It's a bit tricky in general. I'd probably need to write some migration code.

For now I have no content, so clear everything out.

To clear it:

  - Open DevTools → Application → Storage → Local Storage → http://…. Highlight symposium-app-state and hit Delete, then
  refresh.
  - Or in the console run localStorage.removeItem('symposium-app-state'), refresh, and the app will rebuild the default state
  with scheduler.queue: [].
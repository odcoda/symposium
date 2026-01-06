## 2026-01-05 GitHub Pages deployment

Migrated from manual deploy (copied build to odcoda.github.io) to repo-specific GitHub Pages:
- Added `.github/workflows/deploy.yml` for automated builds
- Enabled GitHub Pages via Actions on odcoda/symposium
- Fixed TS error in `ArcsView.tsx` (sumTokens return type)
- Removed old `symposium/` folder from odcoda.github.io

Live at: https://odcoda.github.io/symposium/

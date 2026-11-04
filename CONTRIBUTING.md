# Contributing

Lights Daily is deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Prerequisites

- Node.js 22.12+, 24 or 26+ (Vitest 5 needs `^22.12.0 || ^24.0.0 || >=26.0.0`; CI uses Node 24).
- npm (the repo ships `package-lock.json`).

## Setup

```sh
npm ci
npx playwright install chromium   # once, only needed for npm run e2e
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server at `http://localhost:5173/lights-daily/` (Vite's default port; base path from `vite.config.ts`); if 5173 is busy, Vite picks the next free port and prints the real URL |
| `npm test` | Runs the unit tests (`test` script): Vitest once on `src/**/*.test.ts` and `ops/*.test.ts` |
| `npm run build` | `tsc --noEmit`, then `vite build` into `dist/` |
| `npm run e2e` | Runs `build`, then Playwright on `e2e/*.e2e.ts` in Chromium against `vite preview` on port 4791 |

The e2e port 4791 is fixed (`--strictPort`), so free it before running `npm run e2e`.
Playwright output goes to `test-results/` and `playwright-report/` (both git-ignored).
`npm run e2e` also rewrites the tracked `e2e/screenshots/{start,mid,win}.png` (`e2e/play.e2e.ts`), so the tree is dirty afterwards:
commit them when the UI change is intended, otherwise run `git checkout -- e2e/screenshots`.

For how to play, the daily puzzle and privacy, see [README.md](README.md).

# Lights Daily

Lights Out with a daily puzzle: one 5x5 board per day, the same for everyone.

## How to play

- The board is a 5x5 grid of lights (Lights Out).
- Pressing a cell toggles that cell and its orthogonal neighbours (up, down, left, right).
- The goal is to turn every light off, in as few moves as you can.
- The game is fully keyboard operable, so you can play without a mouse.

## The daily puzzle

- There is one puzzle per day, and it is the same for everyone.
- The puzzle is chosen by the player's **local date**.
- Puzzle #1 is 2026-11-03. The puzzle number is `n` = days since 2026-11-03 + 1.

## Sharing your result

When you solve the day's puzzle you can copy a share string: the line below followed by the page URL. It contains no spoiler (no board, no solution).

```
Lights Daily #<n> <YYYY-MM-DD> — solved in <moves> moves
<page URL>
```

Example:

```
Lights Daily #1 2026-11-03 — solved in 7 moves
```

## Static site

Lights Daily is a static site: no backend. Its one runtime network request is the play count below.

## Privacy

When you leave or hide the page, the game sends one request, at most once per page load, to the public counter service [Abacus](https://abacus.jasoncameron.dev): `GET /hit/lights-daily-plays/<YYYY-MM-DD>-<step>`. It carries only your local date and how far you got: `v` viewed, `s` solved, `sc` solved and copied the result, `sf` solved and clicked feedback, `scf` all three. There are no cookies, no referrer and no identifier, and the game stores nothing about you. Like any web request, Abacus's server sees your IP address. Automated browsers (`navigator.webdriver`) send nothing. Team devices opt out by opening the page once with `?team=1`; this sets `ld-team=1` in that browser's localStorage and removes the parameter from the address.

`ops/lights-daily-pull.mjs` reads these counters (read-only) for the team's play-count signal.

## Development

Built with Vite, TypeScript and vitest.

```sh
npm install      # install dependencies
npm run dev      # start the Vite dev server
npm test         # run the vitest suite once (unit tests and the pull script against a local fake Abacus)
npm run build    # type-check (tsc --noEmit) and build with Vite
npm run e2e      # build, then run the Playwright tests in e2e/
```

These are the scripts defined in `package.json`: `dev`, `build`, `test` and `e2e`.

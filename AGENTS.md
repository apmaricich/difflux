# Difflux

- This is a small Node.js ESM package. The executable entrypoint is `index.js`; `npm start` runs `node index.js`.
- The CLI accepts an optional path as its first argument. It resolves that path relative to the current working directory and runs `git diff --unified=0 --no-color HEAD -- <path>`.
- Runtime requires Node.js `>=20.19.0` because `chokidar` and its dependency declare that engine requirement.
- Test suite: `npm test` runs `node --test test/difflux.test.js`. No lint, typecheck, build, or codegen scripts.
- The working tree is clean; `index.js` has no uncommitted changes.

## Implemented capabilities

- One-shot diff view: `difflux [path]` — shows colored diff between HEAD and working tree.
- Changed-files tree view: `difflux ls [path]` — shows directory tree of changed files with addition/deletion counts.
- Live watch mode: `difflux --watch [path]` and `difflux ls --watch [path]` — uses `chokidar` filesystem notifications plus periodic `git diff` polling (default 1000ms, configurable via `--interval=1..60000`) to refresh automatically.
- Custom terminal renderer with scroll anchoring: `↑`/`↓` to scroll, `r` to refresh while retaining position, `q` or `Ctrl+C` to quit. Shows "New changes available — press r to refresh" when scrolled up.
- Git exit code 1 from `git diff` is treated as success (no changes); actual failures are rejected.
- `--no-ext-diff` is passed to Git to prevent external diff programs from executing.
- `--interval` is validated as a finite positive integer between 1 and 60000 milliseconds.
- Terminal control characters are sanitized from repository content before display.
- Node built-in `node:test` coverage exists for CLI behavior, interval validation, path validation, and empty/changed state.
- `chokidar@^5.0.0` is used for filesystem monitoring, compatible with Node.js `>=20.19.0`.

## Remaining work

- One-shot output larger than the terminal should use `less` with `-L -R -S -X +F` when stdout is a TTY; currently no pager integration exists.
- Optional `--pager less` flag for watch mode could be added if needed.
- Tests for coalesced refreshes, staged/unstaged changes, large-output paging, less fallback, and scroll-position retention are not yet written.

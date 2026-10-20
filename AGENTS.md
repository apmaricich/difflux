# Difflux

- This is a small Node.js ESM package. The executable entrypoint is `index.js`; `npm start` runs `node index.js`.
- The CLI accepts an optional path as its first argument. It resolves that path relative to the current working directory and runs `git diff --unified=0 --no-color HEAD -- <path>`.
- Runtime requires Node.js `>=20.19.0` because `chokidar` and its dependency declare that engine requirement.
- There are no test, lint, typecheck, build, or codegen scripts in `package.json`; use `npm start` for the CLI and inspect the package before adding verification tooling.
- The working tree currently has uncommitted changes to `index.js` (and an untracked `.index.js.swp` editor file). Inspect `git status` and preserve unrelated edits before changing code.

## Automatic monitoring plan

- Add `difflux --watch [path]` without changing the existing one-shot command behavior.
- Use `chokidar` for low-latency filesystem notifications and a periodic `git diff` poll as the authoritative refresh mechanism. Polling is required because index-only operations such as `git add` can change the diff without changing a watched worktree file.
- Default watch mode to automatic live refresh. Use a custom terminal renderer that preserves the user's relative scroll offset. If the user is scrolled away from the bottom, show a status message such as `New changes available — press r to refresh`; pressing `r` refreshes while retaining that relative position. `q` and `Ctrl+C` stop the watcher.
- Support live updates for both the normal diff view and `difflux ls --watch` using the same monitoring and rendering abstractions.
- For one-shot output larger than the terminal, use `less` with `-L -R -S -X +F` when stdout is a TTY. Use `-L` to ignore `LESSOPEN`, `-R` to preserve Difflux colors, `-S` to avoid long-line wrapping, and `-X` to avoid unnecessary terminal initialization. Fall back to direct output if `less` is unavailable or stdout is not a TTY.
- Keep watch output in the custom renderer so the application can control scroll anchoring; expose `--pager less` as an optional less-based mode only if needed.
- Treat Git exit code `1` from `git diff` as a successful diff result. Fix the existing `runGit` helper to preserve stdout for that status and reject only actual Git failures.
- Use `--no-ext-diff` when invoking Git to prevent repository-configured external diff programs from executing. Validate `--interval` as a finite positive integer and keep it within a sensible range.
- Sanitize terminal control characters from repository content before formatting, and do not log diff contents or credentials.
- Add Node built-in `node:test` coverage for Git exit status, interval validation, coalesced refreshes, staged/unstaged changes, large-output paging, less fallback, and scroll-position retention.
- Keep `chokidar@5.0.0` for compatibility with the existing Node.js `>=20.19.0` runtime; do not upgrade to Chokidar v6 without intentionally raising the supported runtime.

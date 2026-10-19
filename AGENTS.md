# Difflux

- This is a small Node.js ESM package. The executable entrypoint is `index.js`; `npm start` runs `node index.js`.
- The CLI accepts an optional path as its first argument. It resolves that path relative to the current working directory and runs `git diff --unified=0 --no-color HEAD -- <path>`.
- Runtime requires Node.js `>=20.19.0` because `chokidar` and its dependency declare that engine requirement.
- There are no test, lint, typecheck, build, or codegen scripts in `package.json`; use `npm start` for the CLI and inspect the package before adding verification tooling.
- The working tree currently has uncommitted changes to `index.js` (and an untracked `.index.js.swp` editor file). Inspect `git status` and preserve unrelated edits before changing code.

edit

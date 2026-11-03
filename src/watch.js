/**
 * Watch mode for Difflux.
 * Monitors a directory for changes and refreshes the diff view live.
 */

import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { runGit, buildDiffArgs, buildNumstatArgs, parseNumstatOutput, getLatestCommitMessage } from "./git.js";
import { formatDiffOutput, formatTreeOutput } from "./format.js";
import { renderWatchFrame, setupRawInput, getTerminalDimensions } from "./terminal.js";
import { STATUS_BAR_ROWS } from "./constants.js";

/**
 * Read and parse .diffluxignore file, returning ignore patterns.
 * Supports gitignore-style patterns.
 * @param {string} cwd - Working directory
 * @returns {string[]} Array of ignore patterns
 */
export function readIgnorePatterns(cwd) {
  // Read .diffluxignore file if it exists
  const ignoreFile = path.join(cwd, ".diffluxignore");
  const customPatterns = [];
  try {
    if (fs.existsSync(ignoreFile)) {
      const content = fs.readFileSync(ignoreFile, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          customPatterns.push(trimmed);
        }
      }
    }
  } catch {
    // Ignore errors reading .diffluxignore
  }

  return customPatterns;
}

/**
 * Create an ignore function based on patterns.
 * Uses a function instead of glob patterns for better control.
 * @param {string} cwd - Working directory
 * @param {string[]} customPatterns - Custom ignore patterns from .diffluxignore
 * @returns {function} A function that takes a file path and returns true if it should be ignored
 */
export function createIgnoreFunction(cwd, customPatterns) {
  return (filePath) => {
    // Normalize path to forward slashes
    const normalizedPath = filePath.replace(/\\/g, "/");

    // Check custom patterns from .diffluxignore
    for (const pattern of customPatterns) {
      if (normalizedPath.includes(pattern)) {
        return true;
      }
    }

    // Default ignore patterns
    const defaultIgnores = [
      "/node_modules/",
      "/.git/",
      "/dist/",
      "/build/",
      "/tmp/",
      "/coverage/",
      "/.cache/",
      "/.next/",
      "/.nuxt/",
      "/.vite/",
      "/__pycache__/",
      ".pyc",
      ".log",
      "/.DS_Store",
    ];

    for (const pattern of defaultIgnores) {
      if (normalizedPath.includes(pattern)) {
        return true;
      }
    }

    return false;
  };
}

/**
 * Create and manage a watch mode session.
 * @param {string} currentDir - Working directory.
 * @param {string} relativeTarget - Target path to watch.
 * @param {string} command - Command type ("tree" or undefined).
 * @param {number} intervalMs - Polling interval.
 */
export async function runWatch(currentDir, relativeTarget, command, intervalMs) {
  const customPatterns = readIgnorePatterns(currentDir);
  const ignoreFn = createIgnoreFunction(currentDir, customPatterns);

  const isMacOS = process.platform === "darwin";
  const watchOptions = {
    cwd: currentDir,
    ignoreInitial: true,
    ignored: ignoreFn,
  };

  // Use native OS watchers for better performance
  if (isMacOS) {
    watchOptions.backend = "native";
  }

  const watcher = chokidar.watch(relativeTarget || ".", watchOptions);

  let refreshTimer = null;
  let lastPoll = Date.now();
  let content = null;
  let prevContent = null;
  let refreshTriggered = false;
  let commitMessage = "";

  const scrollState = {
    scrollOffset: 0,
    maxScrollOffset: 0,
  };

  function scheduleRefresh() {
    if (refreshTriggered) return;
    refreshTriggered = true;

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      try {
        const now = Date.now();
        // Throttle: wait until at least half the interval has elapsed
        // eslint-disable-next-line no-magic-numbers
        if (now - lastPoll < intervalMs / 2) {
          // Throttle: wait until interval has elapsed
          await new Promise((r) =>
            setTimeout(r, intervalMs - (now - lastPoll)),
          );
        }
        lastPoll = Date.now();

        // Fetch latest commit message on each refresh
        commitMessage = await getLatestCommitMessage(currentDir);

        if (command === "tree") {
          const output = await runGit(buildNumstatArgs(relativeTarget), currentDir);
          const changedFiles = parseNumstatOutput(output);
          content = formatTreeOutput(changedFiles);
        } else {
          const output = await runGit(buildDiffArgs(relativeTarget), currentDir);
          content = formatDiffOutput(output);
        }

        // Detect changes
        if (content !== prevContent) {
          const dims = getTerminalDimensions();
          const lineCount = content.split("\n").length;
          const visibleRows = dims.rows - STATUS_BAR_ROWS;
          const newMaxOffset = Math.max(0, lineCount - visibleRows);

          // If user was at bottom, scroll to new bottom; otherwise keep position
          if (scrollState.scrollOffset >= scrollState.maxScrollOffset) {
            scrollState.scrollOffset = newMaxOffset;
          }
          scrollState.maxScrollOffset = newMaxOffset;
          renderWatchFrame(content, scrollState, commitMessage);
          prevContent = content;
        }
      } catch {
        // Ignore transient errors during watch
      } finally {
        refreshTriggered = false;
      }
    }, 0);
  }

  watcher.on("change", scheduleRefresh);
  watcher.on("add", scheduleRefresh);
  watcher.on("unlink", scheduleRefresh);

  // Initial render
  scheduleRefresh();

  // Polling loop for index-only changes
  const pollTimer = setInterval(scheduleRefresh, intervalMs);

  // Keyboard handling
  const restoreTerminal = setupRawInput();

  process.stdin.on("data", (data) => {
    const key = data.toString();

    // q to quit
    if (key === "q" || key === "Q") {
      restoreTerminal();
      process.stdin.destroy();
      watcher.close();
      clearInterval(pollTimer);
      clearTimeout(refreshTimer);
      process.exit(0);
    }

    // r to refresh
    if (key === "r" || key === "R") {
      scrollState.scrollOffset = scrollState.maxScrollOffset;
      scheduleRefresh();
    }

    // Up arrow: scroll up (show earlier content)
    if (key === "k") {
      if (scrollState.scrollOffset > 0) {
        scrollState.scrollOffset--;
      }
      renderWatchFrame(prevContent, scrollState, commitMessage);
    }

    // Down arrow: scroll down (show later content)
    if (key === "j") {
      if (scrollState.scrollOffset < scrollState.maxScrollOffset) {
        scrollState.scrollOffset++;
      }
      renderWatchFrame(prevContent, scrollState, commitMessage);
    }

    // g: jump to top
    if (key === "g") {
      scrollState.scrollOffset = 0;
      renderWatchFrame(prevContent, scrollState, commitMessage);
    }

    // G: jump to bottom
    if (key === "G") {
      scrollState.scrollOffset = scrollState.maxScrollOffset;
      renderWatchFrame(prevContent, scrollState, commitMessage);
    }
  });

  process.on("SIGINT", () => {
    restoreTerminal();
    watcher.close();
    clearInterval(pollTimer);
    clearTimeout(refreshTimer);
    process.exit(0);
  });

  // Terminal resize: re-render at new dimensions
  process.on("SIGWINCH", () => {
    if (prevContent) {
      const dims = getTerminalDimensions();
      const lineCount = prevContent.split("\n").length;
      const visibleRows = dims.rows - STATUS_BAR_ROWS;
      const newMaxOffset = Math.max(0, lineCount - visibleRows);

      // Clamp scroll offset to new valid range
      if (scrollState.scrollOffset > newMaxOffset) {
        scrollState.scrollOffset = newMaxOffset;
      }
      scrollState.maxScrollOffset = newMaxOffset;
      renderWatchFrame(prevContent, scrollState, commitMessage);
    }
  });
}

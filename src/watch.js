/**
 * Watch mode for Difflux.
 * Monitors a directory for changes and refreshes the diff view live.
 */

import chokidar from "chokidar";
import { runGit, buildDiffArgs, buildNumstatArgs, parseNumstatOutput } from "./git.js";
import { formatDiffOutput, formatTreeOutput } from "./format.js";
import { renderWatchFrame, setupRawInput, getTerminalDimensions } from "./terminal.js";
import { DEFAULT_INTERVAL_MS } from "./constants.js";

/**
 * Create and manage a watch mode session.
 * @param {string} currentDir - Working directory.
 * @param {string} relativeTarget - Target path to watch.
 * @param {string} command - Command type ("ls" or undefined).
 * @param {number} intervalMs - Polling interval.
 */
export async function runWatch(currentDir, relativeTarget, command, intervalMs) {
  const watcher = chokidar.watch(relativeTarget || ".", {
    cwd: currentDir,
    ignoreInitial: true,
  });

  let refreshTimer = null;
  let lastPoll = Date.now();
  let content = null;
  let prevContent = null;
  let refreshTriggered = false;

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
        if (now - lastPoll < intervalMs / 2) {
          // Throttle: wait until interval has elapsed
          await new Promise((r) =>
            setTimeout(r, intervalMs - (now - lastPoll)),
          );
        }
        lastPoll = Date.now();

        if (command === "ls") {
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
          const visibleRows = dims.rows - 1;
          const newMaxOffset = Math.max(0, lineCount - visibleRows);

          // If user was at bottom, scroll to new bottom; otherwise keep position
          if (scrollState.scrollOffset >= scrollState.maxScrollOffset) {
            scrollState.scrollOffset = newMaxOffset;
          }
          scrollState.maxScrollOffset = newMaxOffset;
          renderWatchFrame(content, scrollState);
          prevContent = content;
        }
      } catch (err) {
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
      renderWatchFrame(prevContent, scrollState);
    }

    // Down arrow: scroll down (show later content)
    if (key === "j") {
      if (scrollState.scrollOffset < scrollState.maxScrollOffset) {
        scrollState.scrollOffset++;
      }
      renderWatchFrame(prevContent, scrollState);
    }
  });

  process.on("SIGINT", () => {
    restoreTerminal();
    watcher.close();
    clearInterval(pollTimer);
    clearTimeout(refreshTimer);
    process.exit(0);
  });
}

/**
 * Terminal utilities for Difflux.
 * Handles terminal dimensions, rendering, and key input.
 */

import { execSync } from "node:child_process";
import { ANSI, TERMINAL } from "./constants.js";

/**
 * Get terminal dimensions, falling back to environment variables and defaults.
 * @returns {{rows: number, cols: number}} Terminal dimensions.
 */
export function getTerminalDimensions() {
  // Prefer environment variables (set by shells, tmux, herdr, etc.)
  // as they reflect the actual terminal size in nested environments
  if (process.env.LINES && process.env.COLUMNS) {
    const rows = Number.parseInt(process.env.LINES, 10);
    const cols = Number.parseInt(process.env.COLUMNS, 10);
    if (rows > 0 && cols > 0) {
      return { rows, cols };
    }
  }

  // Fall back to process.stdout dimensions (available when stdout is a TTY)
  if (typeof process.stdout.columns === "number" && typeof process.stdout.rows === "number") {
    const cols = process.stdout.columns;
    const rows = process.stdout.rows;
    if (cols > 0 && rows > 0) {
      return { rows, cols };
    }
  }

  // Last resort: defaults
  return { rows: 24, cols: 80 };
}

/**
 * Format the top status bar text.
 * @param {string} commitMessage - The most recent commit message.
 * @returns {string} Formatted top status bar.
 */
export function formatTopStatusBar(commitMessage) {
  const message = commitMessage ? commitMessage : "no commits";
  return `${ANSI.BG_LIGHT_GRAY}${ANSI.FG_BLACK}${ANSI.BOLD} difflux: ${message} ${ANSI.RESET}`;
}

/**
 * Render a watch mode frame with scroll anchoring and status bars.
 * @param {string} content - Content to display.
 * @param {{scrollOffset: number}} state - Scroll state.
 * @param {string} commitMessage - The most recent commit message.
 */
export function renderWatchFrame(content, state, commitMessage) {
  const dims = getTerminalDimensions();
  const lines = content.split("\n");
  const totalLines = lines.length;
  // Reserve 1 row for top status bar, 1 row for bottom status bar
  const visibleRows = dims.rows - 2;

  // Clamp scroll offset to valid range
  const maxOffset = Math.max(0, totalLines - visibleRows);
  const startLine = Math.min(Math.max(0, state.scrollOffset), maxOffset);

  // Build visible frame
  const visibleLines = lines.slice(startLine, startLine + visibleRows);

  // Top status bar
  const topStatusBar = formatTopStatusBar(commitMessage);

  // Bottom status bar
  const atBottom = startLine >= maxOffset;
  const bottomStatusBar = !atBottom
    ? `${ANSI.BOLD}${ANSI.UNDERLINE}New changes available — press r to refresh${ANSI.RESET}`
    : `${ANSI.DIM}Watching... (q to quit)${ANSI.RESET}`;

  // Clear screen and render top status bar
  process.stdout.write(TERMINAL.CLEAR_SCREEN);
  process.stdout.write(topStatusBar);

  // Move cursor to content area (row 2)
  process.stdout.write("\x1b[2;1H");
  process.stdout.write(visibleLines.join("\n"));

  // Position cursor at bottom status bar (last line)
  process.stdout.write(`\x1b[${dims.rows};1H`);
  process.stdout.write(bottomStatusBar);
}

/**
 * Setup raw terminal input mode with proper fallback.
 * @returns {() => void} Cleanup function to restore terminal.
 */
export function setupRawInput() {
  let originalSettings = null;
  let usingStty = false;

  if (process.stdin.isTTY) {
    try {
      originalSettings = execSync("stty -g 2>/dev/null", { encoding: "utf-8" });
      execSync("stty raw -echo 2>/dev/null", { encoding: "utf-8" });
      usingStty = true;
    } catch {
      try {
        process.stdin.setRawMode(true);
      } catch {
        // Ignore if setRawMode also fails
      }
    }
  } else {
    try {
      process.stdin.setRawMode(true);
    } catch {
      // Ignore if setRawMode fails
    }
  }

  process.stdin.resume();

  return () => {
    if (usingStty && originalSettings) {
      try {
        execSync(`stty ${originalSettings}`, { encoding: "utf-8" });
      } catch {
        // Ignore restore errors
      }
    } else {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // Ignore if setRawMode fails
      }
    }
    process.stdin.pause();
  };
}

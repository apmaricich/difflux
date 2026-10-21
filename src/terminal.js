/**
 * Terminal utilities for Difflux.
 * Handles terminal dimensions, rendering, and key input.
 */

import { execSync } from "node:child_process";
import tty from "node:tty";
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
      console.log(rows, cols);
      return { rows, cols };
    }
  }

  // Fall back to tty.getWindowSize()
  try {
    const size = tty.getWindowSize();
    if (size && size[0] > 0 && size[1] > 0) {
      return { rows: size[1], cols: size[0] };
    }
  } catch {
    // tty.getWindowSize() failed
  }

  // Last resort: defaults
  return { rows: 24, cols: 80 };
}

/**
 * Render a watch mode frame with scroll anchoring and status bar.
 * @param {string} content - Content to display.
 * @param {{scrollOffset: number}} state - Scroll state.
 */
export function renderWatchFrame(content, state) {
  const dims = getTerminalDimensions();
  const lines = content.split("\n");
  const totalLines = lines.length;
  const visibleRows = dims.rows - 1;

  // Clamp scroll offset to valid range
  const maxOffset = Math.max(0, totalLines - visibleRows);
  const startLine = Math.min(Math.max(0, state.scrollOffset), maxOffset);

  // Build visible frame
  const visibleLines = lines.slice(startLine, startLine + visibleRows);

  // Status bar at bottom
  const atBottom = startLine >= maxOffset;
  const statusBar = !atBottom
    ? `${ANSI.BOLD}${ANSI.UNDERLINE}New changes available — press r to refresh${ANSI.RESET}`
    : `${ANSI.DIM}Watching... (q to quit)${ANSI.RESET}`;

  // Clear screen and render
  process.stdout.write(TERMINAL.CLEAR_SCREEN);
  process.stdout.write(visibleLines.join("\n"));

  // Position cursor at status bar (last line)
  process.stdout.write(`\x1b[${dims.rows};1H`);
  process.stdout.write(statusBar);
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

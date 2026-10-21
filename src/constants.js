/**
 * Shared constants for the Difflux CLI.
 */

export const DEFAULT_INTERVAL_MS = 1000;
export const MAX_INTERVAL_MS = 60000;
export const MIN_INTERVAL_MS = 1;

export const GIT_NO_COLOR = "--no-color";
export const GIT_NO_EXT_DIFF = "--no-ext-diff";
export const GIT_NO_RENAMES = "--no-renames";
export const GIT_UNIFIED_0 = "--unified=0";
export const GIT_NUMSTAT = "--numstat";
export const GIT_SEPARATOR = "-z";

export const ANSI = {
  RESET: "\x1b[0m",
  BLUE: "\x1b[34m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  UNDERLINE: "\x1b[4m",
};

export const TERMINAL = {
  CLEAR_SCREEN: "\x1b[H\x1b[2J",
};

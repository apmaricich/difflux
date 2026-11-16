/**
 * CLI argument parsing for Difflux.
 */

import { resolve, relative, isAbsolute } from "node:path";
import { DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS } from "./constants.js";
import { readConfig } from "./config.js";

const MAX_CONTEXT_LINES = 100;

/**
 * Parse CLI arguments.
 * @param {string[]} argv - Process arguments.
 * @returns {object} Parsed CLI configuration.
 */
export function parseArgs(argv) {
  const cwdArg = argv.find((a) => a.startsWith("--cwd="));
  const currentDir = cwdArg ? cwdArg.slice("--cwd=".length) : process.cwd();

  // Skip node and script name (argv[0] and argv[1])
  // eslint-disable-next-line no-magic-numbers
  const args = argv.slice(2);
  const command = args.find((a) => !a.startsWith("--"));
  const targetArg =
    command === "tree"
      ? args.find((a) => !a.startsWith("--") && a !== "tree")
      : args.find((a) => !a.startsWith("--"));

  // Validate command: only "tree" or path-like args are valid
  if (command && command !== "tree" && !command.includes("/") && !command.includes(".") && !command.startsWith(".")) {
    throw new Error(`Invalid command: ${command}. Usage: difflux [tree] [path]`);
  }

  const isHelpRequested = argv.includes("--help");
  const isWatchMode = argv.includes("--watch");

  const intervalArg = argv.find((a) => a.startsWith("--interval="));
  const intervalMs = intervalArg
    ? Number.parseInt(intervalArg.slice("--interval=".length), 10)
    : DEFAULT_INTERVAL_MS;

  if (
    intervalArg &&
    (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs > MAX_INTERVAL_MS)
  ) {
    throw new Error(
      `Invalid --interval: ${intervalArg.slice("--interval=".length)}. ` +
        `Must be a finite positive integer between 1 and ${MAX_INTERVAL_MS} milliseconds.`,
    );
  }

  // Read config file for defaults
  const config = readConfig();

  const contextArg = argv.find((a) => a.startsWith("--context="));
  const contextLines = contextArg
    ? Number.parseInt(contextArg.slice("--context=".length), 10)
    : config.context;

  if (
    contextArg &&
    (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > MAX_CONTEXT_LINES)
  ) {
    throw new Error(
      `Invalid --context: ${contextArg.slice("--context=".length)}. ` +
        `Must be a non-negative integer between 0 and ${MAX_CONTEXT_LINES}.`,
    );
  }

  const targetPath = targetArg
    ? resolve(currentDir, targetArg)
    : currentDir;
  const relativeTarget = relative(currentDir, targetPath);

  if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
    throw new Error(
      `Target must be inside the current directory: ${targetPath}`,
    );
  }

  return {
    currentDir,
    command,
    relativeTarget,
    isHelpRequested,
    isWatchMode,
    intervalMs,
    contextLines,
  };
}

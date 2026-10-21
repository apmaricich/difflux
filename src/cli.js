/**
 * CLI argument parsing for Difflux.
 */

import { resolve, relative, isAbsolute } from "node:path";
import { DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS } from "./constants.js";

/**
 * Parse CLI arguments.
 * @param {string[]} argv - Process arguments.
 * @returns {object} Parsed CLI configuration.
 */
export function parseArgs(argv) {
  const cwdArg = argv.find((a) => a.startsWith("--cwd="));
  const currentDir = cwdArg ? cwdArg.slice("--cwd=".length) : process.cwd();

  // Skip node and script name (argv[0] and argv[1])
  const args = argv.slice(2);
  const command = args.find((a) => !a.startsWith("--"));
  const targetArg =
    command === "ls"
      ? args.find((a) => !a.startsWith("--") && a !== "ls")
      : args.find((a) => !a.startsWith("--"));

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
  };
}

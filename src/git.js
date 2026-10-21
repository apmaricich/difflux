/**
 * Git operations for Difflux.
 * Executes git commands and parses their output.
 */

import { execFile } from "node:child_process";
import {
  GIT_NO_COLOR,
  GIT_NO_EXT_DIFF,
  GIT_NO_RENAMES,
  GIT_UNIFIED_0,
  GIT_NUMSTAT,
  GIT_SEPARATOR,
} from "./constants.js";

/**
 * Execute a git command asynchronously.
 * @param {string[]} args - Git command arguments.
 * @param {string} cwd - Working directory.
 * @returns {Promise<string>} stdout from the command.
 */
export function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (err, stdout, stderr) => {
      // Exit code 1 from git diff means "no changes" — treat as success
      if (err && err.code !== 1) {
        reject(new Error(stderr.trim()));
      } else {
        resolve(stdout);
      }
    });
  });
}

/**
 * Build git diff arguments for the unified diff view.
 * @param {string} target - Target path (relative to cwd).
 * @returns {string[]} Git command arguments.
 */
export function buildDiffArgs(target) {
  return [
    "diff",
    GIT_UNIFIED_0,
    GIT_NO_COLOR,
    GIT_NO_EXT_DIFF,
    "HEAD",
    "--",
    target || ".",
  ];
}

/**
 * Build git diff arguments for the numstat (changed files) view.
 * @param {string} target - Target path (relative to cwd).
 * @returns {string[]} Git command arguments.
 */
export function buildNumstatArgs(target) {
  return [
    "diff",
    GIT_NUMSTAT,
    GIT_NO_COLOR,
    GIT_NO_RENAMES,
    GIT_NO_EXT_DIFF,
    GIT_SEPARATOR,
    "HEAD",
    "--",
    target || ".",
  ];
}

/**
 * Parse git numstat output into structured file change records.
 * @param {string} output - Raw numstat output.
 * @returns {Array<{additions: number, deletions: number, path: string}>}
 */
export function parseNumstatOutput(output) {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const [additions, deletions, ...pathParts] = record.split("\t");
      return {
        additions: Number.parseInt(additions, 10),
        deletions: Number.parseInt(deletions, 10),
        path: pathParts.join("\t"),
      };
    });
}

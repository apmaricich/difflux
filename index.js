#!/usr/bin/env node
/**
 * Difflux — A clear, live view of changes made in a Git repository.
 *
 * Shows a colored diff between HEAD and the working tree, with optional
 * live watch mode and directory tree view of changed files.
 */

import { parseArgs } from "./src/cli.js";
import { runGit, buildDiffArgs, buildNumstatArgs, parseNumstatOutput } from "./src/git.js";
import { formatDiffOutput, formatTreeOutput, formatHelp } from "./src/format.js";
import { runWatch } from "./src/watch.js";

async function main() {
  try {
    const {
      currentDir,
      command,
      relativeTarget,
      isHelpRequested,
      isWatchMode,
      intervalMs,
    } = parseArgs(process.argv);

    if (isHelpRequested) {
      process.stdout.write(formatHelp());
      return;
    }

    if (isWatchMode) {
      await runWatch(currentDir, relativeTarget, command, intervalMs);
      return;
    }

    if (command === "ls") {
      const output = await runGit(buildNumstatArgs(relativeTarget), currentDir);
      const changedFiles = parseNumstatOutput(output);
      process.stdout.write(formatTreeOutput(changedFiles) + "\n");
      return;
    }

    const diff = await runGit(buildDiffArgs(relativeTarget), currentDir);
    process.stdout.write(formatDiffOutput(diff));
  } catch (err) {
    process.stderr.write(err.message + "\n");
    process.exit(1);
  }
}

main();

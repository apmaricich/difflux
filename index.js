#!/usr/bin/env node
import { execFile, execSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { openSync } from "node:fs";
import tty from "node:tty";

import chokidar from "chokidar";

const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  underline: "\x1b[4m",
};

const cwdArg = process.argv.find((a) => a.startsWith("--cwd="));
const currentDir = cwdArg ? cwdArg.slice("--cwd=".length) : process.cwd();

// Skip node and script name (argv[0] and argv[1])
const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith("--"));
const targetArg =
  command === "ls"
    ? args.find((a) => !a.startsWith("--") && a !== "ls")
    : args.find((a) => !a.startsWith("--"));
const isHelpRequested = process.argv.includes("--help");
const isWatchMode = process.argv.includes("--watch");
const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
const intervalMs = intervalArg
  ? Number.parseInt(intervalArg.slice("--interval=".length), 10)
  : 1000;

if (
  intervalArg &&
  (!Number.isInteger(intervalMs) || intervalMs <= 0 || intervalMs > 60000)
) {
  process.stderr.write(
    `Invalid --interval: ${intervalArg.slice("--interval=".length)}. ` +
      "Must be a finite positive integer between 1 and 60000 milliseconds.",
  );
  process.exit(1);
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

function sanitizeForTerminal(text) {
  if (!text) return text;
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function formatHeaderTitle(rawHeader, additions, deletions) {
  // Extract single path from a/b pair (use b/ path for renames)
  const headerMatch = rawHeader.match(/^a\/([^ ]+) b\/([^ ]+)/);
  const displayPath = headerMatch ? "./" + headerMatch[2] : "./" + rawHeader;
  return ` ${displayPath} ${formatLineCounts(additions, deletions)} `;
}

function formatDiffOutput(diff) {
  if (!diff) {
    return diff;
  }

  const files = diff
    .split(/^diff --git /m)
    .slice(1)
    .map((file) => file.replace(/^\r?\n/, "").replace(/\r?\n+$/, ""));
  return files
    .map((file) => {
      const lines = file.split(/\r?\n/);
      const rawHeader = lines[0].replace(/^diff --git /, "");
      const additions = lines.filter(
        (line) => line.startsWith("+") && !line.startsWith("+++"),
      ).length;
      const deletions = lines.filter(
        (line) => line.startsWith("-") && !line.startsWith("---"),
      ).length;

      // Extract display path (use b/ path for renames)
      const headerMatch = rawHeader.match(/^a\/([^ ]+) b\/([^ ]+)/);
      const displayPath = headerMatch ? "./" + headerMatch[2] : "./" + rawHeader;

      // Filter to just hunk lines (remove git metadata)
      const hunkLines = lines
        .slice(1)
        .filter(
          (line) =>
            !line.startsWith("index ") &&
            !line.startsWith("--- ") &&
            !line.startsWith("+++ "),
        );

      // Parse hunks: split on @@ headers
      const hunks = parseHunks(hunkLines);

      // Format header: ● path +stats
      const header = `${colors.bold}● ${displayPath}${colors.reset} ${formatLineCounts(additions, deletions)}`;

      // Format each hunk with line numbers and elision
      const formattedHunks = hunks.map((hunk, hunkIndex) => {
        // Determine max line number for padding
        const maxLine = Math.max(
          hunk.oldStart + hunk.oldCount,
          hunk.newStart + hunk.newCount,
        );
        const padWidth = String(maxLine).length;

        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        const formattedLines = hunk.lines.map((line) => {
          if (line.startsWith("+")) {
            const lineNum = String(newLine).padStart(padWidth);
            newLine++;
            return `${lineNum}  ${colors.green}+${line.slice(1)}${colors.reset}`;
          }
          if (line.startsWith("-")) {
            const lineNum = String(oldLine).padStart(padWidth);
            oldLine++;
            return `${lineNum}  ${colors.red}-${line.slice(1)}${colors.reset}`;
          }
          // Context line: show new line number
          const lineNum = String(newLine).padStart(padWidth);
          oldLine++;
          newLine++;
          return `${lineNum}  ${line}`;
        });

        // Add elision between distant hunks
        if (hunkIndex > 0) {
          const prevHunk = hunks[hunkIndex - 1];
          const gap = hunk.oldStart - (prevHunk.oldStart + prevHunk.oldCount);
          if (gap > 2) {
            return [...formattedLines, `...`].join("\n");
          }
        }

        return formattedLines.join("\n");
      });

      return [header, ...formattedHunks].join("\n\n");
    })
    .join("\n\n\n") + (files.length ? "\n" : "");
}

function parseHunks(lines) {
  const hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    // Detect hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: Number.parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] ? Number.parseInt(hunkMatch[2], 10) : 1,
        newStart: Number.parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] ? Number.parseInt(hunkMatch[4], 10) : 1,
        lines: [],
      };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: currentDir }, (err, stdout, stderr) => {
      if (err && err.code !== 1) {
        reject(new Error(stderr.trim()));
      } else {
        resolve(stdout);
      }
    });
  });
}

function parseNumstatOutput(output) {
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

function formatLineCounts(additions, deletions) {
  return `(${colors.green}+${additions}${colors.reset}, ${colors.red}-${deletions}${colors.reset})`;
}

function getVisibleLength(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function formatTreeOutput(changedFiles) {
  if (!changedFiles.length) {
    return ".";
  }

  const root = new Map();
  for (const file of changedFiles) {
    const segments = file.path.split("/");
    const name = segments.pop();
    let directory = root;

    for (const segment of segments) {
      if (!directory.has(segment)) {
        directory.set(segment, new Map());
      }
      directory = directory.get(segment);
    }

    directory.set(name, file);
  }

  function renderDirectory(directory, prefix) {
    return [...directory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, children], index, entries) => {
        const last = index === entries.length - 1;
        const connector = last ? "└── " : "├── ";
        const childPrefix = prefix + (last ? "    " : "│   ");

        if (!(children instanceof Map)) {
          return `${prefix}${connector}${name} ${formatLineCounts(children.additions, children.deletions)}`;
        }

        return [
          `${prefix}${connector}${name}/`,
          ...renderDirectory(children, childPrefix),
        ];
      })
      .flat();
  }

  return [".", ...renderDirectory(root, "")].join("\n");
}

function formatHelp() {
  return [
    "Usage:",
    "  difflux [path]",
    "  difflux ls [path]",
    "  difflux --watch [path]",
    "  difflux ls --watch [path]",
    "  difflux --help",
    "",
    "Commands:",
    "  ls  Show changed files in a tree with additions and deletions",
    "",
    "Options:",
    "  --watch      Watch for changes and refresh live",
    "  --interval=N Poll interval in milliseconds (default: 1000, max: 60000)",
    "",
    "Arguments:",
    "  path  Optional path within the current directory to inspect",
    "",
    "Examples:",
    "  difflux",
    "  difflux src",
    "  difflux --watch",
    "  difflux --watch src",
    "  difflux ls",
    "  difflux ls --watch",
    "  difflux ls --watch src",
  ].join("\n") + "\n";
}

// Watch mode: terminal renderer with scroll anchoring
let watchState = {
  content: null,
  scrolledUp: false,
  scrollOffset: 0,
  needsRefresh: true,
  refreshTriggered: false,
};

function getTerminalDimensions() {
  try {
    return {
      rows: tty.getWindowSize()[1] || 24,
      cols: tty.getWindowSize()[0] || 80,
    };
  } catch {
    return { rows: 24, cols: 80 };
  }
}

function renderWatchFrame(content, state) {
  const dims = getTerminalDimensions();
  const lines = content.split("\n");
  const totalLines = lines.length;

  // Calculate scroll position
  let startLine = 0;
  if (state.scrolledUp) {
    startLine = Math.max(0, totalLines - dims.rows + 1 - state.scrollOffset);
  }

  // Build visible frame
  const visibleLines = lines.slice(startLine, startLine + dims.rows - 2);

  // Status bar at bottom
  const statusBar = state.scrolledUp
    ? `${colors.bold}${colors.underline}New changes available — press r to refresh${colors.reset}`
    : `${colors.dim}Watching... (q to quit)${colors.reset}`;

  // Clear screen and render
  process.stdout.write("\x1b[H\x1b[2J");
  process.stdout.write(visibleLines.join("\n") + "\n");

  // Position cursor at status bar (last line)
  process.stdout.write(`\x1b[${dims.rows};1H`);
  process.stdout.write(statusBar);
}

async function runWatch() {
  const watcher = chokidar.watch(relativeTarget || ".", {
    cwd: currentDir,
    ignoreInitial: true,
  });

  let refreshTimer = null;
  let lastPoll = Date.now();
  let content = null;
  let prevContent = null;

  function scheduleRefresh() {
    if (watchState.refreshTriggered) return;
    watchState.refreshTriggered = true;

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
          const output = await runGit([
            "diff",
            "--numstat",
            "--no-color",
            "--no-renames",
            "--no-ext-diff",
            "-z",
            "HEAD",
            "--",
            relativeTarget || ".",
          ]);
          const changedFiles = parseNumstatOutput(output);
          content = formatTreeOutput(changedFiles);
        } else {
          const output = await runGit([
            "diff",
            "--unified=0",
            "--no-color",
            "--no-ext-diff",
            "HEAD",
            "--",
            relativeTarget || ".",
          ]);
          content = formatDiffOutput(output);
        }

        // Detect changes
        if (content !== prevContent) {
          if (watchState.scrolledUp) {
            watchState.needsRefresh = true;
          } else {
            watchState.content = content;
            renderWatchFrame(content, watchState);
          }
          prevContent = content;
        }
      } catch (err) {
        // Ignore transient errors during watch
      } finally {
        watchState.refreshTriggered = false;
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

  // Keyboard handling: raw mode with echo disabled
  // Save terminal settings and disable echo
  let originalSettings = null;
  let usingStty = false;

  if (process.stdin.isTTY) {
    try {
      originalSettings = execSync("stty -g", { encoding: "utf-8" });
      execSync("stty raw -echo", { encoding: "utf-8" });
      usingStty = true;
    } catch {
      // Fallback to setRawMode if stty fails
      process.stdin.setRawMode(true);
    }
  } else {
    // Not a TTY, use setRawMode
    try {
      process.stdin.setRawMode(true);
    } catch {
      // Ignore if setRawMode fails
    }
  }

  process.stdin.resume();

  function restoreTerminal() {
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
  }

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
      watchState.scrolledUp = false;
      watchState.scrollOffset = 0;
      watchState.needsRefresh = false;
      scheduleRefresh();
    }

    // Up arrow: ESC [ A — scroll up (show earlier content)
    if (key === "\u001b[A") {
      watchState.scrolledUp = true;
      watchState.scrollOffset = watchState.scrollOffset + 1;
      renderWatchFrame(prevContent, watchState);
    }

    // Down arrow: ESC [ B — scroll down (show later content)
    if (key === "\u001b[B") {
      if (watchState.scrollOffset > 0) {
        watchState.scrollOffset--;
      } else {
        watchState.scrolledUp = false;
      }
      renderWatchFrame(prevContent, watchState);
    }
  });

  process.on("SIGINT", () => {
    rl.close();
    watcher.close();
    clearInterval(pollTimer);
    clearTimeout(refreshTimer);
    process.exit(0);
  });
}

async function main() {
  try {
    if (isHelpRequested) {
      process.stdout.write(formatHelp());
      return;
    }

    if (isWatchMode) {
      await runWatch();
      return;
    }

    if (command === "ls") {
      const output = await runGit([
        "diff",
        "--numstat",
        "--no-color",
        "--no-renames",
        "--no-ext-diff",
        "-z",
        "HEAD",
        "--",
        relativeTarget || ".",
      ]);
      const changedFiles = parseNumstatOutput(output);
      process.stdout.write(formatTreeOutput(changedFiles) + "\n");
      return;
    }

    const diff = await runGit([
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "HEAD",
      "--",
      relativeTarget || ".",
    ]);
    process.stdout.write(formatDiffOutput(diff));
  } catch (err) {
    process.stderr.write(err.message + "\n");
  }
}

main();

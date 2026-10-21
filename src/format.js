/**
 * Output formatting for Difflux.
 * Converts raw git diff output into readable, colorized terminal output.
 */

import { ANSI } from "./constants.js";

/**
 * Sanitize text for terminal display by removing ANSI codes and control chars.
 * @param {string} text - Raw text.
 * @returns {string} Sanitized text.
 */
export function sanitizeForTerminal(text) {
  if (!text) return text;
  return text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Format line counts with color.
 * @param {number} additions - Number of added lines.
 * @param {number} deletions - Number of deleted lines.
 * @returns {string} Formatted line count string.
 */
export function formatLineCounts(additions, deletions) {
  return `(${ANSI.GREEN}+${additions}${ANSI.RESET}, ${ANSI.RED}-${deletions}${ANSI.RESET})`;
}

/**
 * Parse git diff hunks from raw lines.
 * @param {string[]} lines - Raw diff lines.
 * @returns {Array<{oldStart: number, oldCount: number, newStart: number, newCount: number, lines: string[]}>}
 */
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

/**
 * Format a single diff file with color, line numbers, and hunk elision.
 * @param {string} file - Raw diff content for one file.
 * @returns {string} Formatted file diff.
 */
function formatFile(file) {
  const lines = file.split(/\r?\n/);
  const rawHeader = lines[0].replace(/^diff --git /, "");

  // Extract display path (use b/ path for renames)
  const headerMatch = rawHeader.match(/^a\/([^ ]+) b\/([^ ]+)/);
  const displayPath = headerMatch ? "./" + headerMatch[2] : "./" + rawHeader;

  // Count additions and deletions
  const additions = lines.filter(
    (line) => line.startsWith("+") && !line.startsWith("+++"),
  ).length;
  const deletions = lines.filter(
    (line) => line.startsWith("-") && !line.startsWith("---"),
  ).length;

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
  const header = `${ANSI.BOLD}● ${displayPath}${ANSI.RESET} ${formatLineCounts(additions, deletions)}`;

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
        return `${lineNum}  ${ANSI.GREEN}+${line.slice(1)}${ANSI.RESET}`;
      }
      if (line.startsWith("-")) {
        const lineNum = String(oldLine).padStart(padWidth);
        oldLine++;
        return `${lineNum}  ${ANSI.RED}-${line.slice(1)}${ANSI.RESET}`;
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
}

/**
 * Format complete git diff output with color and structure.
 * @param {string} diff - Raw git diff output.
 * @returns {string} Formatted, colorized diff.
 */
export function formatDiffOutput(diff) {
  if (!diff) {
    return diff;
  }

  const files = diff
    .split(/^diff --git /m)
    .slice(1)
    .map((file) => file.replace(/^\r?\n/, "").replace(/\r?\n+$/, ""));

  return files
    .map(formatFile)
    .join("\n\n\n") + (files.length ? "\n" : "");
}

/**
 * Build a directory tree structure from changed files.
 * @param {Array<{path: string, additions: number, deletions: number}>} changedFiles
 * @returns {Map} Nested directory structure.
 */
function buildTree(changedFiles) {
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

  return root;
}

/**
 * Render a directory tree structure as formatted text.
 * @param {Map} directory - Nested directory structure.
 * @param {string} prefix - Current indentation prefix.
 * @returns {string[]} Formatted lines.
 */
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

/**
 * Format changed files as a directory tree with addition/deletion counts.
 * @param {Array<{path: string, additions: number, deletions: number}>} changedFiles
 * @returns {string} Formatted tree output.
 */
export function formatTreeOutput(changedFiles) {
  if (!changedFiles.length) {
    return ".";
  }

  const root = buildTree(changedFiles);
  return [".", ...renderDirectory(root, "")].join("\n");
}

/**
 * Generate help text for the CLI.
 * @returns {string} Help text.
 */
export function formatHelp() {
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

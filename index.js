#!/usr/bin/env node
import { execFile } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const currentDir = process.cwd();
const command = process.argv[2];
const targetArg = command === "ls" ? process.argv[3] : process.argv[2];
const isHelpRequested = process.argv.includes("--help");
const targetPath = targetArg
  ? resolve(currentDir, targetArg)
  : currentDir;
const relativeTarget = relative(currentDir, targetPath);

if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
  throw new Error(`Target must be inside the current directory: ${targetPath}`);
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
      const diffHeader = lines[0].replace(/^diff --git /, "");
      const additions = lines.filter(
        (line) => line.startsWith("+") && !line.startsWith("+++"),
      ).length;
      const deletions = lines.filter(
        (line) => line.startsWith("-") && !line.startsWith("---"),
      ).length;
      const title = ` ${diffHeader} ${formatLineCounts(additions, deletions)} `;
      const width = Math.max(getVisibleLength(title), 32);
      const body = lines
        .slice(1)
        .map((line) => {
          if (line.startsWith("+") && !line.startsWith("+++")) {
            return ` | ${colors.green}${line}${colors.reset}`;
          }
          if (line.startsWith("-") && !line.startsWith("---")) {
            return ` | ${colors.red}${line}${colors.reset}`;
          }
          return ` | ${line}`;
        });

      return [
        `${colors.blue}┌─${"─".repeat(width - 2)}─┐${colors.reset}`,
        `│${" ".repeat(width)}│`,
        `│${title}${" ".repeat(width - getVisibleLength(title))}│`,
        `│${" ".repeat(width)}│`,
        `${colors.blue}└─${"─".repeat(width - 2)}─┘${colors.reset}`,
        ...body,
      ].join("\n");
    })
    .join("\n\n") + (files.length ? "\n" : "");
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: currentDir }, (err, stdout, stderr) => {
      if (err) {
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
    "  difflux --help",
    "",
    "Commands:",
    "  ls  Show changed files in a tree with additions and deletions",
    "",
    "Arguments:",
    "  path  Optional path within the current directory to inspect",
    "",
    "Examples:",
    "  difflux",
    "  difflux src",
    "  difflux ls",
    "  difflux ls src",
  ].join("\n") + "\n";
}

async function main() {
  try {
    if (isHelpRequested) {
      process.stdout.write(formatHelp());
      return;
    }
    if (command === "ls") {
      const output = await runGit([
        "diff",
        "--numstat",
        "--no-color",
        "--no-renames",
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

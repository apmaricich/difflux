#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const colors = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const repoRoot = dirname(fileURLToPath(import.meta.url));
const targetArg = process.argv[2];
const targetPath = targetArg
  ? resolve(process.cwd(), targetArg)
  : repoRoot;
const relativeTarget = relative(repoRoot, targetPath);

if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
  throw new Error(`Target must be inside the repository: ${targetPath}`);
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
      const title = ` ${diffHeader} (+${additions} -${deletions}) `;
      const width = Math.max(title.length, 32);
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
        `│${title}${" ".repeat(width - title.length)}│`,
        `│${" ".repeat(width)}│`,
        `${colors.blue}└─${"─".repeat(width - 2)}─┘${colors.reset}`,
        ...body,
      ].join("\n");
    })
    .join("\n\n") + (files.length ? "\n" : "");
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: repoRoot }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim()));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function main() {
  try {
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

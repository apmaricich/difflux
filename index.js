#!/usr/bin/env node
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const repo = resolve(process.argv[2] ?? ".");

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: repo }, (err, stdout, stderr) => {
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
      ".",
    ]);
    process.stdout.write(diff);
  } catch (err) {
    process.stderr.write(err.message + "\n");
  }
}

main();
// new content

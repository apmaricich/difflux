import { describe, test } from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert";

const CLI = resolve(fileURLToPath(import.meta.url), "../..", "index.js");

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(
      "node",
      [CLI, ...args, "--cwd=" + cwd],
      { encoding: "utf-8", stdio: "pipe" },
    );
    return { stdout, stderr: "", code: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      code: err.code ?? 1,
    };
  }
}

function gitSync(args, cwd) {
  execFileSync("git", args, { cwd, encoding: "utf-8" });
}

async function setupRepo() {
  const dir = mkdtempSync(resolve(tmpdir(), "difflux-test-"));
  gitSync(["init", "-q"], dir);
  gitSync(["config", "user.email", "test@example.com"], dir);
  gitSync(["config", "user.name", "Test"], dir);

  writeFileSync(resolve(dir, "README.md"), "# Test\n");
  gitSync(["add", "README.md"], dir);
  gitSync(["commit", "-q", "-m", "Initial commit"], dir);

  return dir;
}

describe("difflux", () => {
  test("shows help with --help", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["--help"], repo);
      assert(result.stdout.includes("Usage:"), "Help should contain Usage:");
      assert(result.stdout.includes("--watch"), "Help should mention --watch");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("shows empty diff on clean repo", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli([], repo);
      assert(result.stdout === "", "Clean repo should have empty diff");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("shows diff for modified file", async () => {
    const repo = await setupRepo();
    try {
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      const result = runCli([], repo);
      assert(result.stdout.includes("README.md"), "Should show modified file");
      assert(result.stdout.includes("+Changed"), "Should show added line");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("shows diff for specific path", async () => {
    const repo = await setupRepo();
    try {
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      const result = runCli(["README.md"], repo);
      assert(result.stdout.includes("README.md"), "Should show specified path");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("ls shows tree of changed files", async () => {
    const repo = await setupRepo();
    try {
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      const result = runCli(["ls"], repo);
      assert(result.stdout.includes("README.md"), "ls should show changed file");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("ls shows empty tree on clean repo", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["ls"], repo);
      assert(result.stdout.trim() === ".", "Clean repo ls should show .");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("rejects invalid interval", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["--interval=0"], repo);
      assert(result.stderr.includes("Invalid --interval"), "Should reject interval=0");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("rejects interval > 60000", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["--interval=60001"], repo);
      assert(result.stderr.includes("Invalid --interval"), "Should reject interval>60000");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("rejects path outside current directory", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["../outside"], repo);
      assert(result.stderr.includes("Target must be inside"), "Should reject path outside cwd");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });
});
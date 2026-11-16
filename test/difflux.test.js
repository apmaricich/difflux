import { describe, test } from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert";

const CLI = resolve(fileURLToPath(import.meta.url), "../..", "index.js");

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(
      "node",
      [CLI, ...args, `--cwd=${cwd}`],
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

// Helper to create a test file with 10 distinct lines
function createContextTestFile(repo) {
  const content = [
    "line 1",
    "line 2",
    "line 3",
    "line 4",
    "line 5",
    "line 6",
    "line 7",
    "line 8",
    "line 9",
    "line 10",
  ].join("\n");
  writeFileSync(resolve(repo, "test.txt"), content);
  gitSync(["add", "test.txt"], repo);
  gitSync(["commit", "-q", "-m", "Add test file"], repo);
  return repo;
}

// Helper to modify line 5 in test.txt
function modifyLine5(repo) {
  const content = readFileSync(resolve(repo, "test.txt"), "utf-8");
  const lines = content.split("\n");
  lines[4] = "line 5 MODIFIED";
  writeFileSync(resolve(repo, "test.txt"), lines.join("\n"));
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

  test("tree shows tree of changed files", async () => {
    const repo = await setupRepo();
    try {
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      const result = runCli(["tree"], repo);
      assert(result.stdout.includes("README.md"), "tree should show changed file");
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("tree shows empty tree on clean repo", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["tree"], repo);
      assert(result.stdout.trim() === ".", "Clean repo tree should show .");
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

  test("rejects invalid command", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["foobar"], repo);
      assert(result.stderr.includes("Invalid command"), "Should reject invalid command");
      assert(result.code === 1, "Should exit with code 1");
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

  // ============================================================
  // CONTEXT FEATURE TESTS
  // ============================================================

  test("default context is 0 lines (backward compatible)", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      modifyLine5(repo);
      const result = runCli([], repo);

      // With context=0, difflux shows only the modified line(s)
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      assert(result.stdout.includes("line 5"), "Should show original line number");

      // No context lines should appear
      assert(
        !result.stdout.includes("line 3"),
        "Default context=0 should not show line 3 as context"
      );
      assert(
        !result.stdout.includes("line 7"),
        "Default context=0 should not show line 7 as context"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("--context=N CLI flag produces correct diff output with context lines", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      modifyLine5(repo);
      const result = runCli(["--context=2"], repo);

      // With context=2, difflux shows 2 lines above and below
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      assert(
        result.stdout.includes("line 3"),
        "Context=2 should show line 3 (above)"
      );
      assert(
        result.stdout.includes("line 7"),
        "Context=2 should show line 7 (below)"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("config file with context value produces correct output", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      // Create config file with context=3
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const { mkdirSync, writeFileSync: fsWrite } = await import("node:fs");
      const configDir = join(homedir(), ".config", "difflux");
      mkdirSync(configDir, { recursive: true });
      fsWrite(join(configDir, "config.json"), JSON.stringify({ context: 3 }));

      modifyLine5(repo);
      const result = runCli([], repo);

      // With config context=3, should show 3 lines above and below
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      assert(
        result.stdout.includes("line 2"),
        "Config context=3 should show line 2 (above)"
      );
      assert(
        result.stdout.includes("line 8"),
        "Config context=3 should show line 8 (below)"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("CLI flag overrides config file (CLI takes precedence)", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      // Create config file with context=5
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const { mkdirSync, writeFileSync: fsWrite } = await import("node:fs");
      const configDir = join(homedir(), ".config", "difflux");
      mkdirSync(configDir, { recursive: true });
      fsWrite(join(configDir, "config.json"), JSON.stringify({ context: 5 }));

      modifyLine5(repo);

      // Use CLI --context=1 (overrides config's 5)
      const result = runCli(["--context=1"], repo);

      // Should show context=1 behavior (1 line above and below)
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      assert(
        result.stdout.includes("line 4"),
        "CLI context=1 should show line 4 (above)"
      );
      assert(
        result.stdout.includes("line 6"),
        "CLI context=1 should show line 6 (below)"
      );
      // Should NOT show 5 context lines (would include line 1 and line 10)
      assert(
        !result.stdout.includes("line 1"),
        "CLI context=1 should not show line 1 (would require context=5)"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("rejects negative --context values", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["--context=-1"], repo);
      assert(
        result.stderr.includes("Invalid --context"),
        "Should reject negative context values"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("accepts and truncates non-integer --context values", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      modifyLine5(repo);
      // --context=2.5 should be truncated to 2 by parseInt
      const result = runCli(["--context=2.5"], repo);
      // Truncated to 2, so should show context=2 behavior
      assert(
        result.stdout.includes("line 5 MODIFIED"),
        "Should show modified line with truncated context"
      );
      assert(
        result.stdout.includes("line 3"),
        "Context=2.5 should be truncated to 2 and show line 3"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("rejects --context values > 100", async () => {
    const repo = await setupRepo();
    try {
      const result = runCli(["--context=101"], repo);
      assert(
        result.stderr.includes("Invalid --context"),
        "Should reject context values > 100"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("accepts --context=0 explicitly", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      modifyLine5(repo);
      const result = runCli(["--context=0"], repo);
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      // With explicit context=0, no surrounding context
      assert(
        !result.stdout.includes("line 3"),
        "Explicit --context=0 should not show line 3"
      );
      assert(
        !result.stdout.includes("line 7"),
        "Explicit --context=0 should not show line 7"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("accepts --context=100 (max value)", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      modifyLine5(repo);
      const result = runCli(["--context=100"], repo);
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      // With context=100, should include all lines (10 is well within limit)
      assert(
        result.stdout.includes("line 1"),
        "Context=100 should include line 1 as context"
      );
      assert(
        result.stdout.includes("line 10"),
        "Context=100 should include line 10 as context"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("config file with context=0 works correctly", async () => {
    const repo = createContextTestFile(await setupRepo());
    try {
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const { mkdirSync, writeFileSync: fsWrite } = await import("node:fs");
      const configDir = join(homedir(), ".config", "difflux");
      mkdirSync(configDir, { recursive: true });
      fsWrite(join(configDir, "config.json"), JSON.stringify({ context: 0 }));

      modifyLine5(repo);
      const result = runCli([], repo);
      assert(result.stdout.includes("line 5 MODIFIED"), "Should show modified line");
      assert(
        !result.stdout.includes("line 3"),
        "Config context=0 should not show line 3"
      );
      assert(
        !result.stdout.includes("line 7"),
        "Config context=0 should not show line 7"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });
});
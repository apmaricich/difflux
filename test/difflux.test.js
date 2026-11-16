import { describe, test } from "node:test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert";

const CLI = resolve(fileURLToPath(import.meta.url), "../..", "index.js");

// Create an empty config file to prevent the user's config from affecting tests
const TEST_CONFIG_DIR = mkdtempSync(resolve(tmpdir(), "difflux-test-config-"));
const TEST_CONFIG_PATH = resolve(TEST_CONFIG_DIR, "config.json");
writeFileSync(TEST_CONFIG_PATH, JSON.stringify({ context: 0 }));

function runCli(args, cwd) {
  try {
    // Always pass an explicit config path so user's config doesn't interfere
    const allArgs = [...args, "--config=" + TEST_CONFIG_PATH, "--cwd=" + cwd];
    const stdout = execFileSync(
      "node",
      [CLI, ...allArgs],
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

/**
 * Run CLI with an explicit config file (for tests that test config behavior).
 * @param {string} configPath - Path to config file
 * @param {string[]} args - Additional CLI arguments
 * @param {string} cwd - Working directory
 * @returns {object} Command result
 */
function runCliWithConfig(configPath, args, cwd) {
  try {
    const allArgs = ["--config=" + configPath, ...args, "--cwd=" + cwd];
    const stdout = execFileSync(
      "node",
      [CLI, ...allArgs],
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
      assert(
        result.stdout.trim() === "Working tree clean.",
        "Clean repo tree should show 'Working tree clean.'",
      );
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
    const tmpDir = mkdtempSync(resolve(tmpdir(), "difflux-test-config-"));
    try {
      const configPath = resolve(tmpDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ context: 3 }));

      modifyLine5(repo);
      const result = runCliWithConfig(configPath, [], repo);

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
      rmSync(tmpDir, { recursive: true });
    }
  });

  test("CLI flag overrides config file (CLI takes precedence)", async () => {
    const repo = createContextTestFile(await setupRepo());
    const tmpDir = mkdtempSync(resolve(tmpdir(), "difflux-test-config-"));
    try {
      // Create config file with context=5
      const configPath = resolve(tmpDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ context: 5 }));

      modifyLine5(repo);

      // Use CLI --context=1 (overrides config's 5)
      const result = runCliWithConfig(configPath, ["--context=1"], repo);

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
      rmSync(tmpDir, { recursive: true });
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
    const tmpDir = mkdtempSync(resolve(tmpdir(), "difflux-test-config-"));
    try {
      const configPath = resolve(tmpDir, "config.json");
      writeFileSync(configPath, JSON.stringify({ context: 0 }));

      modifyLine5(repo);
      const result = runCliWithConfig(configPath, [], repo);
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
      rmSync(tmpDir, { recursive: true });
    }
  });

  // ============================================================
  // UNTRACKED FILES IN TREE VIEW TESTS
  // ============================================================

  test("untracked files appear in tree view with (New) label", async () => {
    const repo = await setupRepo();
    try {
      // Create an untracked file (not added to git)
      writeFileSync(resolve(repo, "new-file.txt"), "untracked content\n");
      
      const result = runCli(["tree"], repo);
      
      assert(
        result.stdout.includes("new-file.txt (New)"),
        "Untracked file should appear with (New) label"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("modified and untracked files shown in separate sections", async () => {
    const repo = await setupRepo();
    try {
      // Modify existing file
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      
      // Create untracked file
      writeFileSync(resolve(repo, "new-file.txt"), "untracked\n");
      
      const result = runCli(["tree"], repo);
      
      // Should have Modified: section header
      assert(
        result.stdout.includes("Modified:"),
        "Should show Modified: section header"
      );
      
      // Should have Untracked: section header
      assert(
        result.stdout.includes("Untracked:"),
        "Should show Untracked: section header"
      );
      
      // Modified file in first section
      const modifiedSection = result.stdout.split("Untracked:")[0];
      assert(
        modifiedSection.includes("README.md"),
        "Modified file should be in Modified: section"
      );
      
      // Untracked file in second section
      const untrackedSection = result.stdout.split("Untracked:")[1];
      assert(
        untrackedSection.includes("new-file.txt (New)"),
        "Untracked file should be in Untracked: section with (New) label"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("no untracked section when no untracked files", async () => {
    const repo = await setupRepo();
    try {
      // Only modify, no untracked files
      writeFileSync(resolve(repo, "README.md"), "# Test\nChanged\n");
      
      const result = runCli(["tree"], repo);
      
      assert(
        !result.stdout.includes("Untracked:"),
        "Should not show Untracked: section when no untracked files"
      );
      assert(
        result.stdout.includes("README.md"),
        "Should still show modified file"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("only untracked section when no modified files", async () => {
    const repo = await setupRepo();
    try {
      // Only untracked, no modifications
      writeFileSync(resolve(repo, "new-file.txt"), "untracked\n");
      
      const result = runCli(["tree"], repo);
      
      // Should show Untracked: header
      assert(
        result.stdout.includes("Untracked:"),
        "Should show Untracked: section header"
      );
      
      // Should NOT show Modified: header
      assert(
        !result.stdout.includes("Modified:"),
        "Should not show Modified: section when no modified files"
      );
      
      assert(
        result.stdout.includes("new-file.txt (New)"),
        "Should show the untracked file with (New) label"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("untracked files in nested directories render correctly", async () => {
    const repo = await setupRepo();
    try {
      // Need to create parent dirs
      const { mkdirSync } = await import("node:fs");
      mkdirSync(resolve(repo, "src/new-module"), { recursive: true });
      
      // Create nested untracked directory structure
      writeFileSync(resolve(repo, "src/new-module/helper.js"), "helper\n");
      
      const result = runCli(["tree"], repo);
      
      // Should show directory structure
      assert(
        result.stdout.includes("src/"),
        "Should show parent directory"
      );
      assert(
        result.stdout.includes("new-module/"),
        "Should show nested directory"
      );
      assert(
        result.stdout.includes("helper.js (New)"),
        "Should show nested untracked file with (New) label"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("untracked files are excluded when .gitignore matches", async () => {
    const repo = await setupRepo();
    try {
      // Create .gitignore
      writeFileSync(resolve(repo, ".gitignore"), "ignored-folder/\n*.tmp\n");
      
      // Create untracked files that should be ignored
      const { mkdirSync } = await import("node:fs");
      mkdirSync(resolve(repo, "ignored-folder"), { recursive: true });
      writeFileSync(resolve(repo, "ignored-folder/file.txt"), "should be ignored\n");
      writeFileSync(resolve(repo, "temp.tmp"), "should be ignored\n");
      
      // Create untracked file that should NOT be ignored
      writeFileSync(resolve(repo, "important.txt"), "should be shown\n");
      
      const result = runCli(["tree"], repo);
      
      assert(
        result.stdout.includes("important.txt (New)"),
        "Should show untracked file not in .gitignore"
      );
      assert(
        !result.stdout.includes("ignored-folder"),
        "Should not show files in ignored folder"
      );
      assert(
        !result.stdout.includes("temp.tmp"),
        "Should not show files matching *.tmp ignore pattern"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("one-shot tree command includes untracked files", async () => {
    const repo = await setupRepo();
    try {
      // Create both modified and untracked files
      writeFileSync(resolve(repo, "README.md"), "# Changed\n");
      writeFileSync(resolve(repo, "untracked.txt"), "untracked\n");
      
      // One-shot command (no --watch)
      const result = runCli(["tree"], repo);
      
      assert(
        result.stdout.includes("README.md"),
        "One-shot tree should include modified files"
      );
      assert(
        result.stdout.includes("untracked.txt (New)"),
        "One-shot tree should include untracked files with (New) label"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("tree with untracked file in specific path", async () => {
    const repo = await setupRepo();
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(resolve(repo, "feature"), { recursive: true });
      
      // Untracked file in specific path
      writeFileSync(resolve(repo, "feature/new.js"), "new code\n");
      
      const result = runCli(["tree", "feature"], repo);
      
      assert(
        result.stdout.includes("new.js (New)"),
        "Should show untracked file when filtering by path"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });

  test("multiple untracked files at same level", async () => {
    const repo = await setupRepo();
    try {
      writeFileSync(resolve(repo, "file1.txt"), "one\n");
      writeFileSync(resolve(repo, "file2.txt"), "two\n");
      writeFileSync(resolve(repo, "file3.txt"), "three\n");
      
      const result = runCli(["tree"], repo);
      
      assert(
        result.stdout.includes("file1.txt (New)"),
        "Should show file1"
      );
      assert(
        result.stdout.includes("file2.txt (New)"),
        "Should show file2"
      );
      assert(
        result.stdout.includes("file3.txt (New)"),
        "Should show file3"
      );
    } finally {
      rmSync(repo, { recursive: true });
    }
  });
});
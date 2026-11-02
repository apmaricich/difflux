import { describe, test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert";
import { readIgnorePatterns, createIgnoreFunction } from "../src/watch.js";

function setupTempDir() {
  const dir = mkdtempSync(resolve(tmpdir(), "difflux-ignore-"));
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true }),
  };
}

describe(".diffluxignore", () => {
  test("readIgnorePatterns returns empty array when no file exists", () => {
    const { dir, cleanup } = setupTempDir();
    try {
      const patterns = readIgnorePatterns(dir);
      assert(Array.isArray(patterns), "Should return array");
      assert(patterns.length === 0, "Should be empty");
    } finally {
      cleanup();
    }
  });

  test("readIgnorePatterns reads patterns from file", () => {
    const { dir, cleanup } = setupTempDir();
    try {
      writeFileSync(resolve(dir, ".diffluxignore"), "custom-dir\n*.tmp\n");
      const patterns = readIgnorePatterns(dir);
      assert(patterns.length === 2, "Should read two patterns");
      assert(patterns[0] === "custom-dir", "First pattern should be custom-dir");
      assert(patterns[1] === "*.tmp", "Second pattern should be *.tmp");
    } finally {
      cleanup();
    }
  });

  test("readIgnorePatterns skips comments", () => {
    const { dir, cleanup } = setupTempDir();
    try {
      writeFileSync(
        resolve(dir, ".diffluxignore"),
        "# This is a comment\nimportant-dir\n",
      );
      const patterns = readIgnorePatterns(dir);
      assert(patterns.length === 1, "Should skip comments");
      assert(patterns[0] === "important-dir");
    } finally {
      cleanup();
    }
  });

  test("createIgnoreFunction ignores node_modules by default", () => {
    const ignoreFn = createIgnoreFunction("/tmp/test", []);
    assert(
      ignoreFn("project/node_modules/pkg/index.js"),
      "Should ignore node_modules",
    );
    assert(
      !ignoreFn("project/src/main.js"),
      "Should not ignore regular files",
    );
  });

  test("createIgnoreFunction ignores .git by default", () => {
    const ignoreFn = createIgnoreFunction("/tmp/test", []);
    assert(
      ignoreFn("project/.git/objects/abc"),
      "Should ignore .git",
    );
  });

  test("createIgnoreFunction ignores dist by default", () => {
    const ignoreFn = createIgnoreFunction("/tmp/test", []);
    assert(
      ignoreFn("project/dist/bundle.js"),
      "Should ignore dist",
    );
  });

  test("createIgnoreFunction respects custom patterns", () => {
    const ignoreFn = createIgnoreFunction("/tmp/test", ["custom-build"]);
    assert(
      ignoreFn("project/custom-build/output.js"),
      "Should ignore custom pattern",
    );
    assert(
      !ignoreFn("project/src/main.js"),
      "Should not ignore other files",
    );
  });

  test("createIgnoreFunction ignores binary and log files", () => {
    const ignoreFn = createIgnoreFunction("/tmp/test", []);
    assert(ignoreFn("project/app.log"), "Should ignore .log");
    assert(ignoreFn("project/script.pyc"), "Should ignore .pyc");
    assert(ignoreFn("project/.DS_Store"), "Should ignore .DS_Store");
  });
});
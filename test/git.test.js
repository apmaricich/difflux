import { describe, test } from "node:test";
import assert from "node:assert";
import { parseNumstatOutput } from "../src/git.js";

describe("parseNumstatOutput", () => {
  test("parses normal text file changes", () => {
    const output = "2\t1\tpath/to/file.txt";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].additions, 2);
    assert.strictEqual(results[0].deletions, 1);
    assert.strictEqual(results[0].path, "path/to/file.txt");
  });

  test("excludes binary files (additions and deletions are -)", () => {
    const output = "-\t-\tbinary.dat\u00003\t1\tsource.js";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results.length, 1, "Binary files should be excluded");
    assert.strictEqual(results[0].path, "source.js");
  });

  test("excludes files excluded via .gitattributes", () => {
    // Simulates .gitattributes with: tasks.json -diff
    // git outputs "-\t-" for excluded files
    const output = "5\t2\tconfig.json\u0000-\t-\ttasks.json\u00003\t0\tREADME.md";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results.length, 2, "Excluded files should be filtered out");
    assert.strictEqual(results[0].path, "config.json");
    assert.strictEqual(results[1].path, "README.md");
    assert(!results.some((r) => r.path === "tasks.json"));
  });

  test("handles null-separated records", () => {
    const output = "1\t0\tfile1.js\u00002\t1\tfile2.js\u0000-\t-\texcluded.txt\u0000";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results.length, 2, "Null-separated records parsed, excluded filtered");
    assert.strictEqual(results[0].path, "file1.js");
    assert.strictEqual(results[1].path, "file2.js");
  });

  test("handles empty output", () => {
    const output = "";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results.length, 0, "Empty output yields empty array");
  });

  test("preserves tab-containing filenames", () => {
    const output = "1\t0\tfile\twith\ttabs.js";
    const results = parseNumstatOutput(output);
    assert.strictEqual(results[0].path, "file\twith\ttabs.js");
  });

  test("no NaN in additions/deletions", () => {
    const output = "3\t2\tok.js\n-\t-\tbad.bin";
    const results = parseNumstatOutput(output);
    for (const r of results) {
      assert(!Number.isNaN(r.additions), `additions is NaN for ${r.path}`);
      assert(!Number.isNaN(r.deletions), `deletions is NaN for ${r.path}`);
    }
  });
});
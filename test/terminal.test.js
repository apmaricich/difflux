import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { getTerminalDimensions } from "../src/terminal.js";

describe("getTerminalDimensions", () => {
  let originalLines;
  let originalColumns;
  let originalStdoutColumns;
  let originalStdoutRows;

  beforeEach(() => {
    originalLines = process.env.LINES;
    originalColumns = process.env.COLUMNS;
    originalStdoutColumns = process.stdout.columns;
    originalStdoutRows = process.stdout.rows;
  });

  afterEach(() => {
    // Restore environment variables
    if (originalLines === undefined) {
      delete process.env.LINES;
    } else {
      process.env.LINES = originalLines;
    }
    if (originalColumns === undefined) {
      delete process.env.COLUMNS;
    } else {
      process.env.COLUMNS = originalColumns;
    }
    // Restore stdout dimensions
    if (originalStdoutColumns === undefined) {
      delete process.stdout.columns;
    } else {
      process.stdout.columns = originalStdoutColumns;
    }
    if (originalStdoutRows === undefined) {
      delete process.stdout.rows;
    } else {
      process.stdout.rows = originalStdoutRows;
    }
  });

  test("uses environment variables when set", () => {
    process.env.LINES = "40";
    process.env.COLUMNS = "120";
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 40, "Should use LINES env var for rows");
    assert.strictEqual(dims.cols, 120, "Should use COLUMNS env var for cols");
  });

  test("falls back to process.stdout dimensions when env vars not set", () => {
    delete process.env.LINES;
    delete process.env.COLUMNS;
    process.stdout.columns = 100;
    process.stdout.rows = 30;
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 30, "Should use stdout.rows when env vars not set");
    assert.strictEqual(dims.cols, 100, "Should use stdout.columns when env vars not set");
  });

  test("falls back to defaults when neither env vars nor stdout dimensions available", () => {
    delete process.env.LINES;
    delete process.env.COLUMNS;
    delete process.stdout.columns;
    delete process.stdout.rows;
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 24, "Should use default rows when nothing else available");
    assert.strictEqual(dims.cols, 80, "Should use default cols when nothing else available");
  });

  test("ignores invalid environment variable values", () => {
    process.env.LINES = "abc";
    process.env.COLUMNS = "xyz";
    process.stdout.columns = 90;
    process.stdout.rows = 25;
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 25, "Should ignore invalid LINES and use stdout.rows");
    assert.strictEqual(dims.cols, 90, "Should ignore invalid COLUMNS and use stdout.columns");
  });

  test("ignores zero environment variable values", () => {
    process.env.LINES = "0";
    process.env.COLUMNS = "0";
    process.stdout.columns = 85;
    process.stdout.rows = 28;
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 28, "Should ignore zero LINES and use stdout.rows");
    assert.strictEqual(dims.cols, 85, "Should ignore zero COLUMNS and use stdout.columns");
  });

  test("handles negative environment variable values", () => {
    process.env.LINES = "-10";
    process.env.COLUMNS = "-20";
    process.stdout.columns = 95;
    process.stdout.rows = 35;
    const dims = getTerminalDimensions();
    assert.strictEqual(dims.rows, 35, "Should ignore negative LINES and use stdout.rows");
    assert.strictEqual(dims.cols, 95, "Should ignore negative COLUMNS and use stdout.columns");
  });
});
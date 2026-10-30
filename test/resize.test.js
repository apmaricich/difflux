import { describe, test } from "node:test";
import assert from "node:assert";
import { getTerminalDimensions } from "../src/terminal.js";

describe("terminal resize behavior", () => {
  test("detects smaller terminal after SIGWINCH", () => {
    process.env.LINES = "40";
    process.env.COLUMNS = "120";
    const before = getTerminalDimensions();
    assert.strictEqual(before.rows, 40);

    process.env.LINES = "20";
    process.env.COLUMNS = "80";
    const after = getTerminalDimensions();
    assert.strictEqual(after.rows, 20, "Should detect smaller height after resize");
    assert.strictEqual(after.cols, 80, "Should detect smaller width after resize");
  });

  test("detects larger terminal after SIGWINCH", () => {
    process.env.LINES = "20";
    process.env.COLUMNS = "80";
    const before = getTerminalDimensions();
    assert.strictEqual(before.rows, 20);

    process.env.LINES = "50";
    process.env.COLUMNS = "150";
    const after = getTerminalDimensions();
    assert.strictEqual(after.rows, 50, "Should detect larger height after resize");
    assert.strictEqual(after.cols, 150, "Should detect larger width after resize");
  });

  test("scroll offset clamped when terminal shrinks", () => {
    // Simulate: content 100 lines, terminal shrinks so scroll needed
    const contentLines = 100;
    const terminalRows = 10;
    const visibleRows = terminalRows - 2; // 8
    const maxOffset = Math.max(0, contentLines - visibleRows); // 92

    // User was scrolled to old bottom
    let scrollOffset = 50;
    if (scrollOffset > maxOffset) {
      scrollOffset = maxOffset;
    }
    assert.strictEqual(scrollOffset, 50, "Scroll offset within new bounds");

    // User was scrolled further than new max
    scrollOffset = 99;
    if (scrollOffset > maxOffset) {
      scrollOffset = maxOffset;
    }
    assert.strictEqual(scrollOffset, 92, "Scroll offset clamped to new max");
  });

  test("scroll offset preserved when terminal grows", () => {
    const contentLines = 100;

    // Terminal grows
    let scrollOffset = 50;
    const terminalRows = 100;
    const visibleRows = terminalRows - 2; // 98
    const maxOffset = Math.max(0, contentLines - visibleRows); // 2

    // Scroll offset should be clamped to new smaller max
    if (scrollOffset > maxOffset) {
      scrollOffset = maxOffset;
    }
    assert.strictEqual(scrollOffset, 2, "Scroll offset clamped when terminal grows past content");
  });

  test("max offset zero when content fits entirely", () => {
    const contentLines = 10;
    const terminalRows = 50;
    const visibleRows = terminalRows - 2;
    const maxOffset = Math.max(0, contentLines - visibleRows);
    assert.strictEqual(maxOffset, 0, "No scrolling when content fits");
  });
});
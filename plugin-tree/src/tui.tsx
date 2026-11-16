import { Plugin } from "@opencode/plugin/tui";
import { exec } from "child_process";
import { createSignal } from "solid-js";
import { parseAnsi } from "./ansi";

async function getDiffluxTree(dir: string): Promise<string> {
  return new Promise((resolve) => {
    exec("node /Users/apmaricich/Code/difflux/index.js tree", { cwd: dir }, (error, stdout, stderr) => {
      if (error || stderr) {
        resolve("");
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function colorToCode(name: string): string {
  if (name.startsWith("#")) {
    return name;
  }
  const map: Record<string, string> = {
    black: "black",
    red: "red",
    green: "green",
    yellow: "yellow",
    blue: "blue",
    magenta: "magenta",
    cyan: "cyan",
    white: "white",
  };
  return map[name] ?? "white";
}

function toOpenTuiStyle(style?: { fg?: string; bg?: string; bold?: boolean; underline?: boolean; italic?: boolean; dim?: boolean }) {
  if (!style) return undefined;
  const result: any = {};
  if (style.fg) result.fg = colorToCode(style.fg);
  if (style.bg) result.bg = colorToCode(style.bg);
  if (style.bold) result.bold = true;
  if (style.underline) result.underline = true;
  if (style.italic) result.italic = true;
  if (style.dim) result.dim = true;
  return Object.keys(result).length > 0 ? result : undefined;
}

export default Plugin.define({
  id: "plugin-tree.tui",
  setup(ctx) {
    let refreshing = false;
    let lastDir: string | null = null;
    const [tree, setTree] = createSignal<string>("");

    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const currentDir = ctx.location?.directory ?? process.cwd();
        if (currentDir !== lastDir) {
          lastDir = currentDir;
        }
        const result = await getDiffluxTree(currentDir);
        setTree(result);
      } catch {
        setTree("");
      } finally {
        refreshing = false;
      }
    };

    refresh();
    const interval = setInterval(refresh, 30000);

    return ctx.ui.slot({
      append: "sidebar.content",
      render: () => {
        const treeText = tree();
        if (!treeText) {
          return null;
        }

        const segments = parseAnsi(treeText);
        const lines: any[][] = [];
        let currentLine: any[] = [];

        for (const seg of segments) {
          if (seg.text.includes('\n')) {
            const parts = seg.text.split('\n');
            for (let i = 0; i < parts.length; i++) {
              if (i > 0 && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = [];
              }
              if (parts[i].length > 0) {
                currentLine.push({ text: parts[i], style: seg.style });
              }
            }
          } else {
            currentLine.push(seg);
          }
        }
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }

        return (
          <box>
            {lines.map((lineSegments) => (
              <text>
                {lineSegments.map((seg) => {
                  const style = toOpenTuiStyle(seg.style);
                  if (style) {
                    return <span style={style}>{seg.text}</span>;
                  }
                  return seg.text;
                })}
              </text>
            ))}
          </box>
        );
      },
    });
  },
});
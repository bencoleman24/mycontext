import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const NETWORK_APIS = /\bfetch\(|XMLHttpRequest|http\.request|https\.request|net\.connect/;

/**
 * Every file allowed to contain a network-capable call, and why:
 * - summarizer.ts: Ollama, localhost by default, only on an explicit summarize action.
 * - app.js: the web UI's own frontend calling its same-origin localhost backend.
 * If this list needs a new entry, that's a real product decision (the README's
 * "nothing phones home" claim), not something to wave through -- add it deliberately.
 */
const ALLOWLIST = new Set(["src/lib/summarizer.ts", "src/web/public/app.js"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (/\.(ts|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("nothing phones home", () => {
  it("only touches network-capable APIs from files on the documented allowlist", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const files = await walk(path.join(root, "src"));

    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(root, file).split(path.sep).join("/");
      if (ALLOWLIST.has(relative)) continue;
      const content = await readFile(file, "utf-8");
      if (NETWORK_APIS.test(content)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist honest -- each entry still actually uses a network API", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    for (const relative of ALLOWLIST) {
      const content = await readFile(path.join(root, relative), "utf-8");
      expect(NETWORK_APIS.test(content)).toBe(true);
    }
  });
});

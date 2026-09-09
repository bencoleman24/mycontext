import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeDesktopConfigPath,
  mergeMcpServerConfig,
  registerWithClaudeCli,
  registerWithClaudeDesktop,
  type CommandResult,
} from "../src/setup.js";

const ENTRY = "/abs/path/to/mycontext/dist/index.js";

describe("mergeMcpServerConfig", () => {
  it("adds mycontext to an empty config", () => {
    const { config, alreadyPresent } = mergeMcpServerConfig({}, ENTRY);
    expect(alreadyPresent).toBe(false);
    expect(config).toEqual({ mcpServers: { mycontext: { command: "node", args: [ENTRY] } } });
  });

  it("handles missing/malformed existing config the same as empty", () => {
    expect(mergeMcpServerConfig(undefined, ENTRY).config).toEqual({
      mcpServers: { mycontext: { command: "node", args: [ENTRY] } },
    });
    expect(mergeMcpServerConfig(null, ENTRY).config).toEqual({
      mcpServers: { mycontext: { command: "node", args: [ENTRY] } },
    });
    expect(mergeMcpServerConfig([1, 2, 3], ENTRY).config).toEqual({
      mcpServers: { mycontext: { command: "node", args: [ENTRY] } },
    });
  });

  it("preserves other servers and top-level keys already in the config", () => {
    const existing = {
      someOtherTopLevelKey: true,
      mcpServers: { other: { command: "node", args: ["/other/server.js"] } },
    };
    const { config } = mergeMcpServerConfig(existing, ENTRY);
    expect(config).toEqual({
      someOtherTopLevelKey: true,
      mcpServers: {
        other: { command: "node", args: ["/other/server.js"] },
        mycontext: { command: "node", args: [ENTRY] },
      },
    });
  });

  it("leaves an already-present mycontext entry completely untouched", () => {
    const existing = {
      mcpServers: { mycontext: { command: "node", args: [ENTRY], env: { MYCONTEXT_DATA_DIR: "/custom" } } },
    };
    const { config, alreadyPresent } = mergeMcpServerConfig(existing, ENTRY);
    expect(alreadyPresent).toBe(true);
    expect(config).toEqual(existing);
  });
});

describe("claudeDesktopConfigPath", () => {
  it("resolves the macOS path under the home directory", () => {
    const result = claudeDesktopConfigPath("darwin", {});
    expect(result).toMatch(/Library\/Application Support\/Claude\/claude_desktop_config\.json$/);
  });

  it("resolves the Windows path from APPDATA", () => {
    const result = claudeDesktopConfigPath("win32", { APPDATA: "C:\\Users\\x\\AppData\\Roaming" });
    expect(result).toBe(path.join("C:\\Users\\x\\AppData\\Roaming", "Claude", "claude_desktop_config.json"));
  });

  it("returns undefined on Windows with no APPDATA set", () => {
    expect(claudeDesktopConfigPath("win32", {})).toBeUndefined();
  });

  it("returns undefined on platforms with no known Claude Desktop path", () => {
    expect(claudeDesktopConfigPath("linux", {})).toBeUndefined();
  });
});

describe("registerWithClaudeCli", () => {
  it("returns not-found when the claude binary isn't on PATH", () => {
    const calls: Array<[string, string[]]> = [];
    const fakeRunner = (cmd: string, args: string[]): CommandResult => {
      calls.push([cmd, args]);
      return { status: null, found: false };
    };
    expect(registerWithClaudeCli(ENTRY, fakeRunner)).toBe("not-found");
    expect(calls).toEqual([["claude", ["--version"]]]);
  });

  it("returns configured and calls mcp add with the right args when claude is present", () => {
    const calls: Array<[string, string[]]> = [];
    const fakeRunner = (cmd: string, args: string[]): CommandResult => {
      calls.push([cmd, args]);
      return { status: 0, found: true };
    };
    expect(registerWithClaudeCli(ENTRY, fakeRunner)).toBe("configured");
    expect(calls[1]).toEqual([
      "claude",
      ["mcp", "add", "--transport", "stdio", "mycontext", "--", "node", ENTRY],
    ]);
  });

  it("returns failed when claude is present but the add command errors", () => {
    let call = 0;
    const fakeRunner = (): CommandResult => {
      call += 1;
      return call === 1 ? { status: 0, found: true } : { status: 1, found: true };
    };
    expect(registerWithClaudeCli(ENTRY, fakeRunner)).toBe("failed");
  });
});

describe("registerWithClaudeDesktop", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mycontext-setup-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns not-found when no config path is given", async () => {
    expect(await registerWithClaudeDesktop(ENTRY, undefined)).toBe("not-found");
  });

  it("returns not-found when the config file doesn't exist", async () => {
    expect(await registerWithClaudeDesktop(ENTRY, path.join(dir, "missing.json"))).toBe("not-found");
  });

  it("registers mycontext, preserves other content, and backs up the original", async () => {
    const configPath = path.join(dir, "claude_desktop_config.json");
    const original = JSON.stringify({ mcpServers: { other: { command: "node", args: ["/x.js"] } } }, null, 2);
    await writeFile(configPath, original, "utf-8");

    const result = await registerWithClaudeDesktop(ENTRY, configPath);
    expect(result).toBe("configured");

    const written = JSON.parse(await readFile(configPath, "utf-8"));
    expect(written.mcpServers.other).toEqual({ command: "node", args: ["/x.js"] });
    expect(written.mcpServers.mycontext).toEqual({ command: "node", args: [ENTRY] });

    const backup = await readFile(`${configPath}.bak`, "utf-8");
    expect(backup).toBe(original);
  });

  it("is idempotent -- reports already-configured and doesn't rewrite the file", async () => {
    const configPath = path.join(dir, "claude_desktop_config.json");
    const alreadyConfigured = JSON.stringify(
      { mcpServers: { mycontext: { command: "node", args: [ENTRY] } } },
      null,
      2,
    );
    await writeFile(configPath, alreadyConfigured, "utf-8");

    expect(await registerWithClaudeDesktop(ENTRY, configPath)).toBe("already-configured");
    expect(await readFile(configPath, "utf-8")).toBe(alreadyConfigured);
  });

  it("throws instead of silently overwriting a config file it can't parse", async () => {
    const configPath = path.join(dir, "claude_desktop_config.json");
    await writeFile(configPath, "{ not valid json", "utf-8");

    await expect(registerWithClaudeDesktop(ENTRY, configPath)).rejects.toThrow(/couldn't parse/i);
  });
});

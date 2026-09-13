import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPS,
  codexToml,
  mcpServersJson,
  onPath,
  renderSetupOutput,
  shellQuote,
  vsCodeAddMcpArg,
  vsCodeServerJson,
  type Environment,
} from "../src/setup.js";

// A path with a space and a quote, since real paths have both.
const ENTRY = "/Users/alex/My Projects/it's mycontext/dist/index.js";

function fakeEnv(present: string[] = [], overrides: Partial<Environment> = {}): Environment {
  const set = new Set(present);
  return {
    platform: "darwin",
    home: "/Users/alex",
    pathVar: "/usr/bin:/opt/homebrew/bin",
    exists: (p) => set.has(p),
    ...overrides,
  };
}

const detected = (env: Environment) => APPS.filter((app) => app.detected(env)).map((app) => app.name);

describe("app list", () => {
  it("is alphabetical, so no provider is listed first by preference", () => {
    const names = APPS.map((app) => app.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("covers the local-server apps from each major provider", () => {
    const all = APPS.map((app) => app.name).join(" | ");
    for (const name of ["ChatGPT", "Claude", "Cursor", "Gemini", "VS Code"]) {
      expect(all).toContain(name);
    }
  });

  it("puts the server path in every app's instructions", () => {
    for (const app of APPS) {
      expect(app.instructions(ENTRY, fakeEnv()), app.name).toContain("My Projects/it");
    }
  });
});

describe("config snippets", () => {
  it("mcpServers JSON parses to the server definition", () => {
    expect(JSON.parse(mcpServersJson(ENTRY))).toEqual({
      mcpServers: { mycontext: { command: "node", args: [ENTRY] } },
    });
  });

  it("VS Code JSON uses the servers key and stdio type", () => {
    expect(JSON.parse(vsCodeServerJson(ENTRY))).toEqual({
      servers: { mycontext: { type: "stdio", command: "node", args: [ENTRY] } },
    });
    expect(JSON.parse(vsCodeAddMcpArg(ENTRY))).toEqual({ name: "mycontext", command: "node", args: [ENTRY] });
  });

  it("Codex TOML escapes Windows backslashes", () => {
    expect(codexToml(ENTRY).split("\n")).toEqual([
      "[mcp_servers.mycontext]",
      'command = "node"',
      `args = [${JSON.stringify(ENTRY)}]`,
    ]);
    expect(codexToml("C:\\Users\\alex\\index.js")).toContain('args = ["C:\\\\Users\\\\alex\\\\index.js"]');
  });
});

describe("shellQuote", () => {
  it("leaves simple paths alone", () => {
    expect(shellQuote("/opt/mycontext/dist/index.js", "darwin")).toBe("/opt/mycontext/dist/index.js");
  });

  it.skipIf(process.platform === "win32")("round-trips spaces and quotes through a real shell", () => {
    const out = execFileSync("/bin/sh", ["-c", `printf %s ${shellQuote(ENTRY, "linux")}`], { encoding: "utf-8" });
    expect(out).toBe(ENTRY);
    const json = vsCodeAddMcpArg(ENTRY);
    expect(execFileSync("/bin/sh", ["-c", `printf %s ${shellQuote(json, "linux")}`], { encoding: "utf-8" })).toBe(json);
  });
});

describe("onPath", () => {
  it("finds a command in a PATH directory", () => {
    expect(onPath("claude", fakeEnv(["/opt/homebrew/bin/claude"]))).toBe(true);
    expect(onPath("claude", fakeEnv())).toBe(false);
  });

  it("checks Windows executable extensions", () => {
    const env = fakeEnv([path.join("C:\\bin", "codex.cmd")], { platform: "win32", pathVar: "C:\\bin" });
    expect(onPath("codex", env)).toBe(true);
  });
});

describe("detection", () => {
  it("finds nothing on a bare machine", () => {
    expect(detected(fakeEnv())).toEqual([]);
  });

  it.each([
    ["/Applications/ChatGPT.app", "ChatGPT desktop app and Codex CLI"],
    ["/Users/alex/.codex", "ChatGPT desktop app and Codex CLI"],
    ["/opt/homebrew/bin/claude", "Claude Code"],
    ["/Users/alex/Library/Application Support/Claude", "Claude Desktop"],
    ["/Applications/Cursor.app", "Cursor"],
    ["/Users/alex/.gemini", "Gemini CLI"],
    ["/Applications/Visual Studio Code.app", "VS Code (GitHub Copilot)"],
  ])("%s -> %s", (present, name) => {
    expect(detected(fakeEnv([present]))).toEqual([name]);
  });
});

describe("renderSetupOutput", () => {
  it("says it doesn't change app settings and always includes the web/phone export note", () => {
    const out = renderSetupOutput(ENTRY, fakeEnv());
    expect(out).toContain("doesn't change any app's settings");
    expect(out).toContain("export your data");
  });

  it("shows every app when none are installed", () => {
    const out = renderSetupOutput(ENTRY, fakeEnv());
    for (const app of APPS) expect(out).toContain(`== ${app.name} ==`);
  });

  it("shows detected apps in full and names the rest", () => {
    const out = renderSetupOutput(ENTRY, fakeEnv(["/Applications/Cursor.app"]));
    expect(out).toContain("== Cursor ==");
    expect(out).toContain("/Users/alex/.cursor/mcp.json");
    expect(out).not.toContain("== Claude Code ==");
    expect(out).toMatch(/Also supported: .*ChatGPT.*Claude Code.*Gemini CLI/);
  });

  it("offers code --add-mcp only when the code command is installed", () => {
    const app = ["/Applications/Visual Studio Code.app"];
    expect(renderSetupOutput(ENTRY, fakeEnv(app))).not.toContain("code --add-mcp");
    expect(renderSetupOutput(ENTRY, fakeEnv([...app, "/opt/homebrew/bin/code"]))).toContain("code --add-mcp");
  });

  it("omits the code --add-mcp shell command on Windows", () => {
    const env = fakeEnv([path.join("C:\\bin", "code.cmd")], {
      platform: "win32",
      pathVar: "C:\\bin",
      appData: "C:\\Users\\alex\\AppData\\Roaming",
    });
    const out = renderSetupOutput("C:\\mycontext\\dist\\index.js", env);
    expect(out).toContain("MCP: Open User Configuration");
    expect(out).not.toContain("code --add-mcp");
  });
});

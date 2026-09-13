#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distEntry = path.join(repoRoot, "dist", "index.js");

// Setup builds the server and prints how to connect each AI app. It never
// edits an app's settings itself: every app gets the same treatment, and a
// privacy tool shouldn't write into other apps' config files unasked.

/** Everything detection needs from the machine, injectable for tests. */
export interface Environment {
  platform: NodeJS.Platform;
  home: string;
  pathVar: string;
  appData?: string;
  exists: (p: string) => boolean;
}

export const realEnvironment: Environment = {
  platform: process.platform,
  home: os.homedir(),
  pathVar: process.env.PATH ?? "",
  appData: process.env.APPDATA,
  exists: existsSync,
};

export function onPath(cmd: string, env: Environment): boolean {
  const sep = env.platform === "win32" ? ";" : ":";
  const exts = env.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return env.pathVar
    .split(sep)
    .filter(Boolean)
    .some((dir) => exts.some((ext) => env.exists(path.join(dir, cmd + ext))));
}

/** Quote a value for pasting into a shell. */
export function shellQuote(value: string, platform: NodeJS.Platform): string {
  if (platform === "win32") return `"${value.replace(/"/g, '\\"')}"`;
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function mcpServersJson(entry: string): string {
  return JSON.stringify({ mcpServers: { mycontext: { command: "node", args: [entry] } } }, null, 2);
}

export function vsCodeServerJson(entry: string): string {
  return JSON.stringify({ servers: { mycontext: { type: "stdio", command: "node", args: [entry] } } }, null, 2);
}

export function vsCodeAddMcpArg(entry: string): string {
  return JSON.stringify({ name: "mycontext", command: "node", args: [entry] });
}

/** TOML basic strings use the same escapes as JSON strings. */
export function codexToml(entry: string): string {
  return `[mcp_servers.mycontext]\ncommand = "node"\nargs = [${JSON.stringify(entry)}]`;
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function claudeDesktopConfigPath(env: Environment): string | undefined {
  if (env.platform === "darwin") {
    return path.join(env.home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (env.platform === "win32" && env.appData) {
    return path.join(env.appData, "Claude", "claude_desktop_config.json");
  }
  return undefined;
}

function vsCodeUserDir(env: Environment): string | undefined {
  if (env.platform === "darwin") return path.join(env.home, "Library", "Application Support", "Code");
  if (env.platform === "win32") return env.appData ? path.join(env.appData, "Code") : undefined;
  return path.join(env.home, ".config", "Code");
}

export interface McpApp {
  name: string;
  detected: (env: Environment) => boolean;
  instructions: (entry: string, env: Environment) => string;
}

/** Kept in alphabetical order, so no provider is listed first by preference. */
export const APPS: McpApp[] = [
  {
    name: "ChatGPT desktop app and Codex CLI",
    detected: (env) =>
      onPath("codex", env) ||
      env.exists(path.join(env.home, ".codex")) ||
      (env.platform === "darwin" && env.exists("/Applications/ChatGPT.app")),
    instructions: (entry, env) =>
      [
        `Add this to ${path.join(env.home, ".codex", "config.toml")}, which the desktop app and CLI share:`,
        indent(codexToml(entry)),
        "Or, with the Codex CLI installed, run:",
        indent(`codex mcp add mycontext -- node ${shellQuote(entry, env.platform)}`),
        "Then restart the ChatGPT desktop app. MCP servers need a recent version of the app.",
      ].join("\n"),
  },
  {
    name: "Claude Code",
    detected: (env) => onPath("claude", env),
    instructions: (entry, env) =>
      ["Run:", indent(`claude mcp add --transport stdio mycontext -- node ${shellQuote(entry, env.platform)}`)].join(
        "\n",
      ),
  },
  {
    name: "Claude Desktop",
    detected: (env) => {
      const config = claudeDesktopConfigPath(env);
      return (
        (config !== undefined && env.exists(path.dirname(config))) ||
        (env.platform === "darwin" && env.exists("/Applications/Claude.app"))
      );
    },
    instructions: (entry, env) =>
      [
        `Quit the app, then add this to ${claudeDesktopConfigPath(env) ?? "claude_desktop_config.json (Settings > Developer > Edit Config)"}:`,
        indent(mcpServersJson(entry)),
        "The app rewrites that file while it's running, so edit it only while the app is closed. Then reopen it.",
      ].join("\n"),
  },
  {
    name: "Cursor",
    detected: (env) =>
      env.exists(path.join(env.home, ".cursor")) || (env.platform === "darwin" && env.exists("/Applications/Cursor.app")),
    instructions: (entry, env) =>
      [
        `Add this to ${path.join(env.home, ".cursor", "mcp.json")}:`,
        indent(mcpServersJson(entry)),
        "Then restart Cursor.",
      ].join("\n"),
  },
  {
    name: "Gemini CLI",
    detected: (env) => onPath("gemini", env) || env.exists(path.join(env.home, ".gemini")),
    instructions: (entry, env) =>
      ["Run:", indent(`gemini mcp add --scope user mycontext node ${shellQuote(entry, env.platform)}`)].join("\n"),
  },
  {
    name: "VS Code (GitHub Copilot)",
    detected: (env) => {
      const dir = vsCodeUserDir(env);
      return (
        onPath("code", env) ||
        (dir !== undefined && env.exists(dir)) ||
        (env.platform === "darwin" && env.exists("/Applications/Visual Studio Code.app"))
      );
    },
    instructions: (entry, env) => {
      const openConfig = `"MCP: Open User Configuration" in VS Code and add this under "servers":`;
      // The `code` command is optional on macOS, and its JSON argument doesn't survive Windows shell quoting.
      const lines =
        onPath("code", env) && env.platform !== "win32"
          ? ["Run:", indent(`code --add-mcp ${shellQuote(vsCodeAddMcpArg(entry), env.platform)}`), `Or run ${openConfig}`]
          : [`Run ${openConfig}`];
      return [
        ...lines,
        indent(vsCodeServerJson(entry)),
        "VS Code asks you to confirm you trust the server before it starts.",
      ].join("\n");
    },
  },
];

export function renderSetupOutput(entry: string, env: Environment): string {
  const found = APPS.filter((app) => app.detected(env));
  const shown = found.length > 0 ? found : APPS;
  const lines = [
    "",
    "mycontext is built. Setup doesn't change any app's settings; connect the apps you use with the instructions below.",
    `The server runs with: node ${shellQuote(entry, env.platform)}`,
    "",
    found.length > 0
      ? "AI apps found on this computer:"
      : "No supported AI apps found on this computer. Instructions for each:",
    "",
  ];
  for (const app of shown) {
    lines.push(`== ${app.name} ==`, app.instructions(entry, env), "");
  }
  const others = APPS.filter((app) => !found.includes(app));
  if (found.length > 0 && others.length > 0) {
    lines.push(`Also supported: ${others.map((app) => app.name).join(", ")}. See docs/mcp.md#connect-an-app`, "");
  }
  lines.push(
    "Using ChatGPT, Claude, or Gemini on the web or on a phone? Those can't reach a server on your computer.",
    "Instead, export your data from the web UI's Data page and paste it into the chat.",
  );
  return lines.join("\n");
}

function main(): void {
  console.log("Building...");
  execFileSync("npm", ["run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(renderSetupOutput(distEntry, realEnvironment));
}

const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error("Setup failed:", err);
    process.exit(1);
  }
}

#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distEntry = path.join(repoRoot, "dist", "index.js");

// --- Claude Code CLI registration ---------------------------------------

export interface CommandResult {
  status: number | null;
  /** false if the binary itself couldn't be found (ENOENT), as opposed to running and failing. */
  found: boolean;
}

export type CommandRunner = (cmd: string, args: string[]) => CommandResult;

export const realCommandRunner: CommandRunner = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  const err = result.error as NodeJS.ErrnoException | undefined;
  return { status: result.status, found: !err || err.code !== "ENOENT" };
};

export type CliRegisterResult = "configured" | "failed" | "not-found";

export function registerWithClaudeCli(
  entryPath: string,
  runner: CommandRunner = realCommandRunner,
): CliRegisterResult {
  const versionCheck = runner("claude", ["--version"]);
  if (!versionCheck.found) return "not-found";

  const addResult = runner("claude", [
    "mcp",
    "add",
    "--transport",
    "stdio",
    "mycontext",
    "--",
    "node",
    entryPath,
  ]);
  return addResult.status === 0 ? "configured" : "failed";
}

// --- Claude Desktop config merge -----------------------------------------

export function claudeDesktopConfigPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (platform === "win32" && env.APPDATA) {
    return path.join(env.APPDATA, "Claude", "claude_desktop_config.json");
  }
  return undefined;
}

/**
 * Pure merge: adds a `mycontext` entry to `mcpServers` without touching
 * anything else already in the config. If `mycontext` is already present,
 * it's left completely alone -- re-running setup must never clobber a
 * customization someone made by hand (an extra env var, etc.).
 */
export function mergeMcpServerConfig(
  existing: unknown,
  entryPath: string,
): { config: Record<string, unknown>; alreadyPresent: boolean } {
  const config =
    typeof existing === "object" && existing !== null && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  const mcpServers =
    typeof config.mcpServers === "object" && config.mcpServers !== null
      ? { ...(config.mcpServers as Record<string, unknown>) }
      : {};

  if (mcpServers.mycontext) {
    return { config: { ...config, mcpServers }, alreadyPresent: true };
  }

  mcpServers.mycontext = { command: "node", args: [entryPath] };
  return { config: { ...config, mcpServers }, alreadyPresent: false };
}

export type DesktopRegisterResult = "configured" | "already-configured" | "not-found";

export async function registerWithClaudeDesktop(
  entryPath: string,
  configPath: string | undefined,
): Promise<DesktopRegisterResult> {
  if (!configPath || !existsSync(configPath)) return "not-found";

  const raw = await readFile(configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Couldn't parse ${configPath} as JSON: ${(err as Error).message}`);
  }

  const { config, alreadyPresent } = mergeMcpServerConfig(parsed, entryPath);
  if (alreadyPresent) return "already-configured";

  const backupPath = `${configPath}.bak`;
  if (!existsSync(backupPath)) {
    await writeFile(backupPath, raw, "utf-8");
  }

  const tmpPath = `${configPath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await rename(tmpPath, configPath);
  return "configured";
}

// --- Orchestration ---------------------------------------------------------

function printManualInstructions(entryPath: string): void {
  console.log(`
Couldn't auto-register mycontext anywhere. Add it manually:

Claude Code:
  claude mcp add --transport stdio mycontext -- node ${entryPath}

Claude Desktop (claude_desktop_config.json):
  {
    "mcpServers": {
      "mycontext": {
        "command": "node",
        "args": ["${entryPath}"]
      }
    }
  }
`);
}

async function main(): Promise<void> {
  if (!existsSync(distEntry)) {
    console.log("Building...");
    execFileSync("npm", ["run", "build"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }

  let configuredAnywhere = false;

  const cliResult = registerWithClaudeCli(distEntry);
  if (cliResult === "configured") {
    console.log("Registered mycontext with the Claude Code CLI.");
    configuredAnywhere = true;
  } else if (cliResult === "failed") {
    console.log(
      "`claude mcp add` didn't succeed -- if mycontext is already registered, you're all set; otherwise see the manual instructions below.",
    );
  } else {
    console.log("`claude` CLI not found on PATH -- skipping Claude Code auto-registration.");
  }

  const desktopPath = claudeDesktopConfigPath();
  try {
    const desktopResult = await registerWithClaudeDesktop(distEntry, desktopPath);
    if (desktopResult === "configured") {
      console.log(
        `Registered mycontext in Claude Desktop's config (${desktopPath}). Restart Claude Desktop to pick it up.`,
      );
      configuredAnywhere = true;
    } else if (desktopResult === "already-configured") {
      console.log("mycontext is already registered in Claude Desktop's config.");
      configuredAnywhere = true;
    } else {
      console.log("Claude Desktop config not found -- skipping.");
    }
  } catch (err) {
    console.log(`Couldn't update Claude Desktop's config: ${(err as Error).message}`);
  }

  if (!configuredAnywhere) {
    printManualInstructions(distEntry);
  } else {
    console.log("\nSetup complete.");
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("Setup failed:", err);
    process.exit(1);
  });
}

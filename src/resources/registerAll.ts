import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContextResources } from "./contextResources.js";

export function registerAllResources(server: McpServer): void {
  registerContextResources(server);
}

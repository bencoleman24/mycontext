import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllResources } from "./resources/registerAll.js";
import { registerAllTools } from "./tools/registerAll.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mycontext",
    version: "0.1.0",
  });

  registerAllTools(server);
  registerAllResources(server);

  return server;
}

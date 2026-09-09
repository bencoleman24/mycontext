#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the JSON-RPC channel; log startup to stderr only.
  console.error("mycontext: connected via stdio");
}

main().catch((err) => {
  console.error("mycontext: fatal error", err);
  process.exit(1);
});

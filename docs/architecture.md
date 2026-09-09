# Architecture

```
schemas/     zod schemas, one per data type, each with a *_SCHEMA_VERSION
   ↓
storage/     JSON file stores with the migration engine
   ↓
services/    business logic
   ↓
   ├── tools/       MCP tools
   ├── resources/   MCP resources
   └── web/         HTTP API + static web UI
```

Tools and routes contain no logic. An MCP tool and an HTTP route that do the same thing call the same service function, so the two surfaces can't drift. Adding another way to capture data means writing another adapter over `services/`, not another data model.

Data is stored as JSON rather than SQLite so you can read it without this app. The storage layer sits behind a small interface, so SQLite could be swapped in later.

## Development

```bash
npm run dev        # run the MCP server with tsx, no build step
npm run web        # run the web UI
npm run setup      # build and register with any MCP client found
npm run build      # bundle the MCP server to dist/index.js
npm test           # 111 tests across 11 files
npm run typecheck
npm run lint
```

CI runs typecheck, lint, tests, and build on Node 20, 22, and 24 for every push and pull request.

Tests point `MYCONTEXT_DATA_DIR` at a fresh temp directory, so they never touch real data. The summarizer is injected, so nothing hits the network.

`test/noExternalNetworkCalls.test.ts` walks `src/` and fails the build if a file outside a two-entry allowlist uses a network API. If you need to add one, the allowlist is in the test.

To exercise the MCP surface without a chat client, see [testing without a chat client](mcp.md#testing-without-a-chat-client).

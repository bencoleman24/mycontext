import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExportTools } from "./exportTools.js";
import { registerFileTools } from "./fileTools.js";
import { registerHabitTools } from "./habitTools.js";
import { registerJournalTools } from "./journalTools.js";
import { registerProfileTools } from "./profileTools.js";
import { registerProfileQuestionTools } from "./profileQuestionTools.js";
import { registerThoughtTools } from "./thoughtTools.js";

export function registerAllTools(server: McpServer): void {
  registerProfileTools(server);
  registerProfileQuestionTools(server);
  registerHabitTools(server);
  registerJournalTools(server);
  registerThoughtTools(server);
  registerFileTools(server);
  registerExportTools(server);
}

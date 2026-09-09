import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { exportContext } from "../services/exportService.js";
import { textResult } from "./toolResult.js";

export function registerExportTools(server: McpServer): void {
  server.registerTool(
    "export_context",
    {
      title: "Export personal context",
      description:
        "Generate a full 'Personal Context Export' bundling the user's profile, journal entries, thoughts, habit data, and uploaded file metadata, formatted for use as AI context. Choose markdown (human + AI readable), json (structured), or csv (habit logs only).",
      inputSchema: {
        format: z.enum(["markdown", "json", "csv"]).default("markdown"),
        sections: z
          .array(z.enum(["profile", "journal", "thoughts", "habits", "files"]))
          .optional()
          .describe("Which sections to include. Defaults to all."),
        from: z
          .iso.date()
          .optional()
          .describe("Inclusive start date (YYYY-MM-DD). Bounds journal/thoughts/files/habit-log rows; omit for all-time. Doesn't affect the profile section or habit summary stats."),
        to: z.iso.date().optional().describe("Inclusive end date (YYYY-MM-DD). Omit for all-time."),
        journalDetail: z
          .enum(["full", "summary"])
          .optional()
          .describe(
            "\"summary\" replaces each journal entry's content with its saved summary (or a placeholder if it has none). Defaults to \"full\".",
          ),
      },
    },
    async ({ format, sections, from, to, journalDetail }) => {
      const result = await exportContext({ format, sections, from, to, journalDetail });
      return textResult(result.content);
    },
  );
}
